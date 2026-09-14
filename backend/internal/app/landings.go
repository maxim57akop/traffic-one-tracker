package app

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

type LandingFile struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	Extension string `json:"extension"`
	Editable  bool   `json:"editable"`
}

type landingCreateInput struct {
	Name      string
	GroupName string
	Folder    string
	Status    string
	ZipFile   multipart.File
	ZipSize   int64
}

type landingUpdateInput struct {
	Name      *string
	GroupName *string
	Status    *string
	ZipFile   multipart.File
	ZipSize   int64
}

func parseLandingCreateInput(w http.ResponseWriter, r *http.Request) (landingCreateInput, func(), bool) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid multipart payload")
			return landingCreateInput{}, nil, false
		}

		input := landingCreateInput{
			Name:      r.FormValue("name"),
			GroupName: r.FormValue("group_name"),
			Folder:    r.FormValue("folder"),
			Status:    r.FormValue("status"),
		}

		file, header, err := r.FormFile("zip")
		if err == nil {
			if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
				_ = file.Close()
				writeError(w, http.StatusUnprocessableEntity, "ZIP file is required")
				return landingCreateInput{}, nil, false
			}
			input.ZipFile = file
			input.ZipSize = header.Size
			return input, func() { _ = file.Close() }, true
		}

		return input, nil, true
	}

	var input landingCreateInput
	var jsonInput struct {
		Name      string `json:"name"`
		GroupName string `json:"group_name"`
		Folder    string `json:"folder"`
		Status    string `json:"status"`
	}
	if !decodeJSON(w, r, &jsonInput) {
		return landingCreateInput{}, nil, false
	}
	input.Name = jsonInput.Name
	input.GroupName = jsonInput.GroupName
	input.Folder = jsonInput.Folder
	input.Status = jsonInput.Status
	return input, nil, true
}

func parseLandingUpdateInput(w http.ResponseWriter, r *http.Request) (landingUpdateInput, func(), bool) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid multipart payload")
			return landingUpdateInput{}, nil, false
		}

		input := landingUpdateInput{}
		if value := r.FormValue("name"); value != "" {
			input.Name = &value
		}
		if _, exists := r.MultipartForm.Value["group_name"]; exists {
			value := r.FormValue("group_name")
			input.GroupName = &value
		}
		if value := r.FormValue("status"); value != "" {
			input.Status = &value
		}

		file, header, err := r.FormFile("zip")
		if err == nil {
			if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
				_ = file.Close()
				writeError(w, http.StatusUnprocessableEntity, "ZIP file is required")
				return landingUpdateInput{}, nil, false
			}
			input.ZipFile = file
			input.ZipSize = header.Size
			return input, func() { _ = file.Close() }, true
		}

		return input, nil, true
	}

	var input landingUpdateInput
	var jsonInput struct {
		Name      *string `json:"name"`
		GroupName *string `json:"group_name"`
		Status    *string `json:"status"`
	}
	if !decodeJSON(w, r, &jsonInput) {
		return landingUpdateInput{}, nil, false
	}
	input.Name = jsonInput.Name
	input.GroupName = jsonInput.GroupName
	input.Status = jsonInput.Status
	return input, nil, true
}

func (app *App) getLanding(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, landing)
}

func (app *App) updateLanding(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	input, closeFile, ok := parseLandingUpdateInput(w, r)
	if !ok {
		return
	}
	if closeFile != nil {
		defer closeFile()
	}
	if input.Status != nil && *input.Status != "active" && *input.Status != "paused" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid status")
		return
	}

	var item Landing
	err := app.db.QueryRow(
		r.Context(),
		`UPDATE landings SET
		  name = COALESCE($1::text, name),
		  group_name = COALESCE($2::text, group_name),
		  status = COALESCE($3::text, status),
		  updated_at = now()
		 WHERE id = $4 AND team_id = $5
		 RETURNING id, team_id, user_id, name, url, status, group_name, landing_type, local_path`,
		nullableTrimPtr(input.Name),
		nullableTrimPtr(input.GroupName),
		input.Status,
		id,
		user.TeamID,
	).Scan(landingScanTargets(&item)...)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if input.ZipFile != nil {
		if err := app.extractLandingZip(item.LocalPath, input.ZipFile, input.ZipSize); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}
	app.finishLanding(&item)
	writeJSON(w, http.StatusOK, item)
}

func (app *App) deleteLanding(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	tag, err := app.db.Exec(r.Context(), "DELETE FROM landings WHERE id = $1 AND team_id = $2", id, user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete landing")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Landing not found")
		return
	}
	if landing.LocalPath != "" {
		_ = os.RemoveAll(app.landingDir(landing.LocalPath))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) landingFiles(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	files, err := app.listLandingFiles(landing.LocalPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load landing files")
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (app *App) landingFileContent(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	filePath, err := app.resolveLandingFile(landing.LocalPath, r.URL.Query().Get("path"))
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

func (app *App) updateLandingFileContent(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	var input struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	filePath, err := app.resolveLandingFile(landing.LocalPath, input.Path)
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

func (app *App) downloadLanding(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	landing, err := app.landingByID(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+landing.LocalPath+`.zip"`)

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	root := app.landingDir(landing.LocalPath)
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

func (app *App) serveLanding(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/lander/")
	app.serveLandingPath(w, r, path)
}

func (app *App) serveLandingURL(w http.ResponseWriter, r *http.Request, rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.IsAbs() || !strings.HasPrefix(parsed.Path, "/lander/") {
		return false
	}
	app.serveLandingPath(w, r, strings.TrimPrefix(parsed.Path, "/lander/"))
	return true
}

func (app *App) serveLandingPath(w http.ResponseWriter, r *http.Request, path string) {
	path = strings.Trim(path, "/")
	if path == "" {
		writeError(w, http.StatusNotFound, "Landing not found")
		return
	}

	parts := strings.SplitN(path, "/", 2)
	localPath := parts[0]
	if _, ok := normalizeLandingFolder(localPath); !ok {
		writeError(w, http.StatusNotFound, "Landing not found")
		return
	}

	requested := "index.html"
	if len(parts) == 2 && strings.TrimSpace(parts[1]) != "" {
		requested = parts[1]
	}
	filePath, err := app.resolveLandingFile(localPath, requested)
	if err != nil {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}
	if _, err := os.Stat(filePath); errors.Is(err, os.ErrNotExist) && requested == "index.html" {
		filePath, err = app.resolveLandingFile(localPath, "index.php")
	}
	if err != nil {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}

	http.ServeFile(w, r, filePath)
}

func (app *App) scanLanding(row scanner) (Landing, error) {
	var item Landing
	if err := row.Scan(landingScanTargets(&item)...); err != nil {
		return Landing{}, err
	}
	app.finishLanding(&item)
	return item, nil
}

func landingScanTargets(item *Landing) []any {
	var groupName pgtype.Text
	var landingType pgtype.Text
	var localPath pgtype.Text

	return []any{
		&item.ID,
		&item.TeamID,
		&item.UserID,
		&item.Name,
		&item.URL,
		&item.Status,
		&groupNameScanner{target: &item.GroupName, value: &groupName},
		&landingTextScanner{target: &item.LandingType, value: &landingType, fallback: "local"},
		&landingTextScanner{target: &item.LocalPath, value: &localPath},
	}
}

type groupNameScanner struct {
	target **string
	value  *pgtype.Text
}

func (scanner *groupNameScanner) Scan(src any) error {
	if err := scanner.value.Scan(src); err != nil {
		return err
	}
	if scanner.value.Valid {
		value := scanner.value.String
		*scanner.target = &value
		return nil
	}
	*scanner.target = nil
	return nil
}

type landingTextScanner struct {
	target   *string
	value    *pgtype.Text
	fallback string
}

func (scanner *landingTextScanner) Scan(src any) error {
	if err := scanner.value.Scan(src); err != nil {
		return err
	}
	if scanner.value.Valid {
		*scanner.target = scanner.value.String
	} else {
		*scanner.target = scanner.fallback
	}
	return nil
}

func (app *App) finishLanding(item *Landing) {
	if item.LandingType == "" {
		item.LandingType = "local"
	}
	if item.LocalPath == "" {
		if folder, ok := normalizeLandingFolder(item.Name); ok {
			item.LocalPath = folder
		}
	}
	if item.URL == "" && item.LocalPath != "" {
		item.URL = landingURL(item.LocalPath)
	}
	item.PreviewURL = previewObjectURL("landings.preview", item.ID)
	if item.LocalPath != "" {
		item.FilesCount = app.countLandingFiles(item.LocalPath)
	}
}

func (app *App) landingByID(ctx context.Context, teamID, id int64) (Landing, error) {
	return app.scanLanding(app.db.QueryRow(
		ctx,
		`SELECT id, team_id, user_id, name, url, status, group_name, landing_type, local_path
		 FROM landings
		 WHERE id = $1 AND team_id = $2`,
		id,
		teamID,
	))
}

func (app *App) createLandingScaffold(localPath string, name string) error {
	dir := app.landingDir(localPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	indexPath := filepath.Join(dir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		return nil
	}

	html := `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>` + htmlEscape(name) + `</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f5f5; color: #202020; }
      main { max-width: 520px; padding: 40px; background: #fff; border: 1px solid #ddd; }
      a { color: #1683e9; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>` + htmlEscape(name) + `</h1>
      <p>Local landing page scaffold.</p>
      <p><a href="{offer}">Offer link</a></p>
    </main>
  </body>
</html>
`
	return os.WriteFile(indexPath, []byte(html), 0o644)
}

func (app *App) extractLandingZip(localPath string, file multipart.File, size int64) error {
	if size <= 0 {
		return errors.New("ZIP file is empty")
	}

	reader, err := zip.NewReader(file, size)
	if err != nil {
		return errors.New("Invalid ZIP file")
	}

	if err := os.MkdirAll(app.landerRoot, 0o755); err != nil {
		return err
	}
	tempRoot, err := os.MkdirTemp(app.landerRoot, "."+localPath+"-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempRoot)

	stripPrefix := commonZipRoot(reader.File)
	for _, zipFile := range reader.File {
		name := filepath.ToSlash(zipFile.Name)
		name = strings.TrimPrefix(name, "/")
		if stripPrefix != "" {
			name = strings.TrimPrefix(name, stripPrefix+"/")
		}
		if name == "" || strings.HasPrefix(name, "__MACOSX/") {
			continue
		}

		targetPath, err := resolveFileInRoot(tempRoot, name)
		if err != nil {
			return errors.New("ZIP contains unsafe paths")
		}

		if zipFile.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}
		source, err := zipFile.Open()
		if err != nil {
			return err
		}
		target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, zipFile.FileInfo().Mode())
		if err != nil {
			_ = source.Close()
			return err
		}
		_, copyErr := io.Copy(target, source)
		closeErr := target.Close()
		_ = source.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}

	if !landingDirHasIndex(tempRoot) {
		return errors.New("ZIP must contain index.html or index.php")
	}

	root := app.landingDir(localPath)
	if err := os.RemoveAll(root); err != nil {
		return err
	}
	if err := os.Rename(tempRoot, root); err != nil {
		return err
	}
	return nil
}

func commonZipRoot(files []*zip.File) string {
	root := ""
	for _, file := range files {
		if file.FileInfo().IsDir() {
			continue
		}
		name := strings.Trim(filepath.ToSlash(file.Name), "/")
		if name == "" || strings.HasPrefix(name, "__MACOSX/") {
			continue
		}
		parts := strings.Split(name, "/")
		if len(parts) < 2 {
			return ""
		}
		if root == "" {
			root = parts[0]
			continue
		}
		if root != parts[0] {
			return ""
		}
	}
	return root
}

func (app *App) landingHasIndex(localPath string) bool {
	return landingDirHasIndex(app.landingDir(localPath))
}

func landingDirHasIndex(root string) bool {
	for _, name := range []string{"index.html", "index.php"} {
		if filePath, err := resolveFileInRoot(root, name); err == nil {
			if info, statErr := os.Stat(filePath); statErr == nil && !info.IsDir() {
				return true
			}
		}
	}
	return false
}

func (app *App) listLandingFiles(localPath string) ([]LandingFile, error) {
	root := app.landingDir(localPath)
	files := []LandingFile{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		relative = filepath.ToSlash(relative)
		files = append(files, LandingFile{
			Path:      relative,
			Name:      entry.Name(),
			Size:      info.Size(),
			Extension: strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name())), "."),
			Editable:  editableLandingFile(path),
		})
		return nil
	})
	return files, err
}

func (app *App) countLandingFiles(localPath string) int {
	files, err := app.listLandingFiles(localPath)
	if err != nil {
		return 0
	}
	return len(files)
}

func (app *App) landingDir(localPath string) string {
	return filepath.Join(app.landerRoot, localPath)
}

func (app *App) resolveLandingFile(localPath string, requested string) (string, error) {
	return resolveFileInRoot(app.landingDir(localPath), requested)
}

func resolveFileInRoot(root string, requested string) (string, error) {
	if strings.TrimSpace(requested) == "" {
		requested = "index.html"
	}
	if filepath.IsAbs(requested) {
		return "", errors.New("absolute paths are not allowed")
	}
	clean := filepath.Clean(filepath.FromSlash(requested))
	if clean == "." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || clean == ".." {
		return "", errors.New("path escapes landing")
	}

	root, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	filePath, err := filepath.Abs(filepath.Join(root, clean))
	if err != nil {
		return "", err
	}
	if filePath != root && !strings.HasPrefix(filePath, root+string(filepath.Separator)) {
		return "", errors.New("path escapes landing")
	}
	return filePath, nil
}

func normalizeLandingFolder(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "", false
	}

	var builder strings.Builder
	previousDash := false
	for _, r := range value {
		allowed := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if allowed {
			builder.WriteRune(r)
			previousDash = false
			continue
		}
		if (r == '-' || r == '_' || r == ' ') && !previousDash {
			builder.WriteRune('-')
			previousDash = true
		}
	}
	result := strings.Trim(builder.String(), "-")
	return result, result != "" && !strings.Contains(result, "..")
}

func landingURL(localPath string) string {
	return "/lander/" + localPath + "/"
}

func previewObjectURL(object string, id int64) string {
	return "/?object=" + url.QueryEscape(object) + "&id=" + strconv.FormatInt(id, 10)
}

func editableLandingFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".html", ".htm", ".php", ".css", ".js", ".json", ".txt", ".md", ".log":
		return true
	default:
		return false
	}
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return replacer.Replace(value)
}
