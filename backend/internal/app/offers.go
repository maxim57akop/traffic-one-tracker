package app

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

type offerInput struct {
	Name                 string  `json:"name"`
	URL                  string  `json:"url"`
	GroupName            string  `json:"group_name"`
	AffiliateNetwork     string  `json:"affiliate_network"`
	Country              string  `json:"country"`
	Status               string  `json:"status"`
	OfferType            string  `json:"offer_type"`
	Folder               string  `json:"folder"`
	PayoutType           string  `json:"payout_type"`
	Payout               float64 `json:"payout"`
	PayoutCurrency       string  `json:"payout_currency"`
	PayoutFromParam      bool    `json:"payout_from_param"`
	ConversionCapEnabled bool    `json:"conversion_cap_enabled"`
	DailyConversionCap   int     `json:"daily_conversion_cap"`
	Notes                string  `json:"notes"`
	ZipFile              multipart.File
	ZipSize              int64
}

func parseOfferInput(w http.ResponseWriter, r *http.Request) (offerInput, func(), bool) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid multipart payload")
			return offerInput{}, nil, false
		}

		input := offerInput{
			Name:                 r.FormValue("name"),
			URL:                  r.FormValue("url"),
			GroupName:            r.FormValue("group_name"),
			AffiliateNetwork:     r.FormValue("affiliate_network"),
			Country:              r.FormValue("country"),
			Status:               r.FormValue("status"),
			OfferType:            r.FormValue("offer_type"),
			Folder:               r.FormValue("folder"),
			PayoutType:           r.FormValue("payout_type"),
			Payout:               parseFloatValue(r.FormValue("payout")),
			PayoutCurrency:       r.FormValue("payout_currency"),
			PayoutFromParam:      parseBoolValue(r.FormValue("payout_from_param"), true),
			ConversionCapEnabled: parseBoolValue(r.FormValue("conversion_cap_enabled"), false),
			DailyConversionCap:   parseIntValue(r.FormValue("daily_conversion_cap")),
			Notes:                r.FormValue("notes"),
		}

		file, header, err := r.FormFile("zip")
		if err == nil {
			if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
				_ = file.Close()
				writeError(w, http.StatusUnprocessableEntity, "ZIP file is required")
				return offerInput{}, nil, false
			}
			input.ZipFile = file
			input.ZipSize = header.Size
			return input, func() { _ = file.Close() }, true
		}

		return input, nil, true
	}

	var input offerInput
	if !decodeJSON(w, r, &input) {
		return offerInput{}, nil, false
	}
	return input, nil, true
}

func parseFloatValue(value string) float64 {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err == nil {
		return parsed
	}
	return 0
}

func parseIntValue(value string) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err == nil {
		return parsed
	}
	return 0
}

func parseBoolValue(value string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on":
		return true
	case "false", "0", "no", "off":
		return false
	default:
		return fallback
	}
}

func (app *App) offers(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		offerSelectSQL()+` WHERE team_id = $1 ORDER BY id DESC`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load offers")
		return
	}
	defer rows.Close()

	items := []Offer{}
	for rows.Next() {
		item, err := app.scanOffer(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read offer")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createOffer(w http.ResponseWriter, r *http.Request, user User) {
	input, closeFile, ok := parseOfferInput(w, r)
	if !ok {
		return
	}
	if closeFile != nil {
		defer closeFile()
	}
	if err := normalizeOfferInput(&input); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	localPath, url, err := app.prepareOfferFiles(input, "")
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if url != "" {
		input.URL = url
	}

	item, err := app.insertOffer(r.Context(), user, input, localPath)
	if err != nil {
		if localPath != nil {
			_ = os.RemoveAll(app.landingDir(*localPath))
		}
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (app *App) getOffer(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	offer, err := app.offerByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, offer)
}

func (app *App) updateOffer(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	existing, err := app.offerByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	input, closeFile, ok := parseOfferInput(w, r)
	if !ok {
		return
	}
	if closeFile != nil {
		defer closeFile()
	}
	if input.Name == "" {
		input.Name = existing.Name
	}
	if input.Status == "" {
		input.Status = existing.Status
	}
	if input.OfferType == "" {
		input.OfferType = existing.OfferType
	}
	if input.PayoutType == "" {
		input.PayoutType = existing.PayoutType
	}
	if input.PayoutCurrency == "" {
		input.PayoutCurrency = existing.PayoutCurrency
	}
	if err := normalizeOfferInput(&input); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	localPath, url, err := app.prepareOfferFiles(input, existing.LocalPath)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if url != "" {
		input.URL = url
	}
	if input.OfferType != "local" && existing.LocalPath != "" {
		_ = os.RemoveAll(app.landingDir(existing.LocalPath))
	}

	item, err := app.updateOfferRow(r.Context(), user.TeamID, id, input, localPath)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (app *App) deleteOffer(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	offer, err := app.offerByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	tag, err := app.db.Exec(r.Context(), "DELETE FROM offers WHERE id = $1 AND team_id = $2", id, user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete offer")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Offer not found")
		return
	}
	if offer.LocalPath != "" {
		_ = os.RemoveAll(app.landingDir(offer.LocalPath))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) offerFiles(w http.ResponseWriter, r *http.Request, user User) {
	offer, ok := app.localOfferForFiles(w, r, user)
	if !ok {
		return
	}

	files, err := app.listLandingFiles(offer.LocalPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load offer files")
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (app *App) offerFileContent(w http.ResponseWriter, r *http.Request, user User) {
	offer, ok := app.localOfferForFiles(w, r, user)
	if !ok {
		return
	}

	filePath, err := app.resolveLandingFile(offer.LocalPath, r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid file path")
		return
	}
	if !editableLandingFile(filePath) {
		writeError(w, http.StatusUnsupportedMediaType, "File is not editable")
		return
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"content": string(content)})
}

func (app *App) updateOfferFileContent(w http.ResponseWriter, r *http.Request, user User) {
	offer, ok := app.localOfferForFiles(w, r, user)
	if !ok {
		return
	}

	var input struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	filePath, err := app.resolveLandingFile(offer.LocalPath, input.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid file path")
		return
	}
	if !editableLandingFile(filePath) {
		writeError(w, http.StatusUnsupportedMediaType, "File is not editable")
		return
	}
	if err := os.WriteFile(filePath, []byte(input.Content), 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save file")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

func (app *App) downloadOffer(w http.ResponseWriter, r *http.Request, user User) {
	offer, ok := app.localOfferForFiles(w, r, user)
	if !ok {
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+offer.LocalPath+`.zip"`)

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	root := app.landingDir(offer.LocalPath)
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		target, err := zipWriter.Create(filepath.ToSlash(relative))
		if err != nil {
			return nil
		}
		source, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer source.Close()
		_, _ = io.Copy(target, source)
		return nil
	})
}

func (app *App) localOfferForFiles(w http.ResponseWriter, r *http.Request, user User) (Offer, bool) {
	id, ok := pathID(w, r)
	if !ok {
		return Offer{}, false
	}
	offer, err := app.offerByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return Offer{}, false
	}
	if offer.OfferType != "local" || offer.LocalPath == "" {
		writeError(w, http.StatusUnprocessableEntity, "Offer has no local files")
		return Offer{}, false
	}
	return offer, true
}

func normalizeOfferInput(input *offerInput) error {
	input.Name = strings.TrimSpace(input.Name)
	input.URL = strings.TrimSpace(input.URL)
	input.Status = strings.TrimSpace(input.Status)
	input.OfferType = strings.TrimSpace(input.OfferType)
	input.PayoutType = strings.TrimSpace(input.PayoutType)
	input.PayoutCurrency = strings.ToUpper(strings.TrimSpace(input.PayoutCurrency))
	input.Country = strings.ToUpper(strings.TrimSpace(input.Country))

	if input.Name == "" {
		return errors.New("Offer name is required")
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if input.Status != "active" && input.Status != "paused" {
		return errors.New("Invalid status")
	}
	if input.OfferType == "" {
		input.OfferType = "redirect"
	}
	if input.OfferType != "local" && input.OfferType != "redirect" && input.OfferType != "preload" && input.OfferType != "action" {
		return errors.New("Invalid offer type")
	}
	if input.OfferType != "local" && input.URL == "" {
		return errors.New("Offer URL is required")
	}
	if input.Country != "" && len(input.Country) != 2 {
		return errors.New("Invalid country")
	}
	if input.PayoutType == "" {
		input.PayoutType = "cpa"
	}
	if input.PayoutType != "cpa" && input.PayoutType != "cpc" {
		return errors.New("Invalid payout type")
	}
	if input.PayoutCurrency == "" {
		input.PayoutCurrency = "EUR"
	}
	if len(input.PayoutCurrency) != 3 {
		return errors.New("Invalid payout currency")
	}
	if input.DailyConversionCap < 0 {
		input.DailyConversionCap = 0
	}
	if !input.ConversionCapEnabled {
		input.DailyConversionCap = 0
	}
	return nil
}

func (app *App) prepareOfferFiles(input offerInput, existingLocalPath string) (*string, string, error) {
	if input.OfferType != "local" {
		if input.ZipFile != nil {
			return nil, "", errors.New("ZIP upload is available only for local offers")
		}
		return nil, "", nil
	}

	folder := existingLocalPath
	if strings.TrimSpace(input.Folder) != "" {
		folder = input.Folder
	}
	if folder == "" {
		folder = input.Name
	}
	localPath, ok := normalizeLandingFolder(folder)
	if !ok {
		return nil, "", errors.New("Invalid folder")
	}

	if input.ZipFile != nil {
		if err := app.extractLandingZip(localPath, input.ZipFile, input.ZipSize); err != nil {
			return nil, "", err
		}
	} else if existingLocalPath == "" {
		if err := app.createLandingScaffold(localPath, input.Name); err != nil {
			return nil, "", errors.New("Could not create offer files")
		}
	}

	return &localPath, landingURL(localPath), nil
}

func (app *App) insertOffer(ctx context.Context, user User, input offerInput, localPath *string) (Offer, error) {
	return app.scanOffer(app.db.QueryRow(
		ctx,
		`INSERT INTO offers (
		  team_id, user_id, name, url, status, payout, group_name,
		  affiliate_network, country, offer_type, local_path, payout_type,
		  payout_currency, payout_from_param, conversion_cap_enabled,
		  daily_conversion_cap, notes
		 )
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		 RETURNING `+offerColumns(),
		user.TeamID,
		user.ID,
		input.Name,
		input.URL,
		input.Status,
		input.Payout,
		nullableTrim(input.GroupName),
		nullableTrim(input.AffiliateNetwork),
		nullableTrim(input.Country),
		input.OfferType,
		localPath,
		input.PayoutType,
		input.PayoutCurrency,
		input.PayoutFromParam,
		input.ConversionCapEnabled,
		input.DailyConversionCap,
		nullableTrim(input.Notes),
	))
}

func (app *App) updateOfferRow(ctx context.Context, teamID, id int64, input offerInput, localPath *string) (Offer, error) {
	return app.scanOffer(app.db.QueryRow(
		ctx,
		`UPDATE offers SET
		  name = $1,
		  url = $2,
		  status = $3,
		  payout = $4,
		  group_name = $5,
		  affiliate_network = $6,
		  country = $7,
		  offer_type = $8,
		  local_path = $9,
		  payout_type = $10,
		  payout_currency = $11,
		  payout_from_param = $12,
		  conversion_cap_enabled = $13,
		  daily_conversion_cap = $14,
		  notes = $15,
		  updated_at = now()
		 WHERE id = $16 AND team_id = $17
		 RETURNING `+offerColumns(),
		input.Name,
		input.URL,
		input.Status,
		input.Payout,
		nullableTrim(input.GroupName),
		nullableTrim(input.AffiliateNetwork),
		nullableTrim(input.Country),
		input.OfferType,
		localPath,
		input.PayoutType,
		input.PayoutCurrency,
		input.PayoutFromParam,
		input.ConversionCapEnabled,
		input.DailyConversionCap,
		nullableTrim(input.Notes),
		id,
		teamID,
	))
}

func (app *App) offerByID(ctx context.Context, teamID, id int64) (Offer, error) {
	return app.scanOffer(app.db.QueryRow(
		ctx,
		offerSelectSQL()+` WHERE team_id = $1 AND id = $2`,
		teamID,
		id,
	))
}

func offerSelectSQL() string {
	return `SELECT ` + offerColumns() + ` FROM offers`
}

func offerColumns() string {
	return `id, team_id, user_id, name, url, status, payout::float8,
	        group_name, affiliate_network, country, offer_type, local_path,
	        payout_type, payout_currency, payout_from_param,
	        conversion_cap_enabled, daily_conversion_cap, notes`
}

func (app *App) scanOffer(row scanner) (Offer, error) {
	var item Offer
	var groupName pgtype.Text
	var affiliateNetwork pgtype.Text
	var country pgtype.Text
	var localPath pgtype.Text
	var notes pgtype.Text
	err := row.Scan(
		&item.ID,
		&item.TeamID,
		&item.UserID,
		&item.Name,
		&item.URL,
		&item.Status,
		&item.Payout,
		&groupName,
		&affiliateNetwork,
		&country,
		&item.OfferType,
		&localPath,
		&item.PayoutType,
		&item.PayoutCurrency,
		&item.PayoutFromParam,
		&item.ConversionCapEnabled,
		&item.DailyConversionCap,
		&notes,
	)
	if err != nil {
		return Offer{}, err
	}
	item.GroupName = textPtr(groupName)
	item.AffiliateNetwork = textPtr(affiliateNetwork)
	item.Country = textPtr(country)
	item.Notes = textPtr(notes)
	if localPath.Valid {
		item.LocalPath = localPath.String
		item.FilesCount = app.countLandingFiles(localPath.String)
		item.PreviewURL = previewObjectURL("offers.preview", item.ID)
	}
	if item.OfferType == "" {
		item.OfferType = "redirect"
	}
	if item.PayoutType == "" {
		item.PayoutType = "cpa"
	}
	if item.PayoutCurrency == "" {
		item.PayoutCurrency = "EUR"
	}
	return item, nil
}

func textPtr(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}
