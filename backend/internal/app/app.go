package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	mrand "math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/redis/go-redis/v9"
	qrcode "github.com/skip2/go-qrcode"
	"golang.org/x/crypto/bcrypt"
)

type App struct {
	db                  *pgxpool.Pool
	redis               *redis.Client
	redisCampaignPrefix string
	clickhouseURL       string
	clickhouseDatabase  string
	serverIP            string
	landerRoot          string
}

type Team struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Users []User `json:"users,omitempty"`
}

type User struct {
	ID               int64   `json:"id"`
	TeamID           int64   `json:"team_id"`
	Name             string  `json:"name"`
	Email            string  `json:"email"`
	Role             string  `json:"role"`
	AvatarURL        *string `json:"avatar_url,omitempty"`
	TwoFactorEnabled bool    `json:"two_factor_enabled"`
	ManagerID        *int64  `json:"manager_id,omitempty"`
	Team             *Team   `json:"team,omitempty"`
}

type Campaign struct {
	ID                 int64             `json:"id"`
	TeamID             int64             `json:"team_id"`
	UserID             int64             `json:"user_id"`
	Name               string            `json:"name"`
	Slug               string            `json:"slug"`
	DomainID           *int64            `json:"domain_id,omitempty"`
	DomainName         *string           `json:"domain_name,omitempty"`
	TrafficSourceID    *int64            `json:"traffic_source_id,omitempty"`
	Alias              string            `json:"alias"`
	GroupName          *string           `json:"group_name,omitempty"`
	SourceName         *string           `json:"source_name,omitempty"`
	FlowRotation       string            `json:"flow_rotation"`
	CostModel          string            `json:"cost_model"`
	CostValue          float64           `json:"cost_value"`
	CostCurrency       string            `json:"cost_currency"`
	CostFromParam      bool              `json:"cost_from_param"`
	TrafficLoss        int               `json:"traffic_loss"`
	Uniqueness         string            `json:"uniqueness"`
	UseCookies         bool              `json:"use_cookies"`
	UniquenessTTLHours int               `json:"uniqueness_ttl_hours"`
	APIToken           string            `json:"api_token"`
	Parameters         map[string]string `json:"parameters"`
	S2SPostbacks       map[string]string `json:"s2s_postbacks"`
	Notes              *string           `json:"notes,omitempty"`
	Status             string            `json:"status"`
}

type TrafficSource struct {
	ID          int64             `json:"id"`
	TeamID      int64             `json:"team_id"`
	UserID      int64             `json:"user_id"`
	Name        string            `json:"name"`
	PostbackURL *string           `json:"postback_url,omitempty"`
	Parameters  map[string]string `json:"parameters"`
	Notes       *string           `json:"notes,omitempty"`
}

type Country struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type Offer struct {
	ID                   int64   `json:"id"`
	TeamID               int64   `json:"team_id"`
	UserID               int64   `json:"user_id"`
	Name                 string  `json:"name"`
	URL                  string  `json:"url"`
	Status               string  `json:"status"`
	Payout               float64 `json:"payout"`
	GroupName            *string `json:"group_name,omitempty"`
	AffiliateNetwork     *string `json:"affiliate_network,omitempty"`
	Country              *string `json:"country,omitempty"`
	OfferType            string  `json:"offer_type"`
	LocalPath            string  `json:"local_path"`
	PreviewURL           string  `json:"preview_url"`
	FilesCount           int     `json:"files_count"`
	PayoutType           string  `json:"payout_type"`
	PayoutCurrency       string  `json:"payout_currency"`
	PayoutFromParam      bool    `json:"payout_from_param"`
	ConversionCapEnabled bool    `json:"conversion_cap_enabled"`
	DailyConversionCap   int     `json:"daily_conversion_cap"`
	Notes                *string `json:"notes,omitempty"`
}

type Landing struct {
	ID          int64   `json:"id"`
	TeamID      int64   `json:"team_id"`
	UserID      int64   `json:"user_id"`
	Name        string  `json:"name"`
	URL         string  `json:"url"`
	Status      string  `json:"status"`
	GroupName   *string `json:"group_name,omitempty"`
	LandingType string  `json:"landing_type"`
	LocalPath   string  `json:"local_path"`
	PreviewURL  string  `json:"preview_url"`
	FilesCount  int     `json:"files_count"`
}

type Domain struct {
	ID                int64   `json:"id"`
	TeamID            int64   `json:"team_id"`
	UserID            int64   `json:"user_id"`
	Domain            string  `json:"domain"`
	GroupName         *string `json:"group_name,omitempty"`
	Status            string  `json:"status"`
	AllowIndexing     bool    `json:"allow_indexing"`
	AllowAdminAccess  bool    `json:"allow_admin_access"`
	HTTPSOnly         bool    `json:"https_only"`
	IndexCampaignID   *int64  `json:"index_campaign_id,omitempty"`
	IndexCampaignName *string `json:"index_campaign_name,omitempty"`
	IndexCampaignSlug *string `json:"index_campaign_slug,omitempty"`
	CampaignsCount    int     `json:"campaigns_count"`
}

type Flow struct {
	ID            int64   `json:"id"`
	CampaignID    int64   `json:"campaign_id"`
	Name          string  `json:"name"`
	FlowType      string  `json:"flow_type"`
	Position      int     `json:"position"`
	CollectClicks bool    `json:"collect_clicks"`
	Status        string  `json:"status"`
	Notes         *string `json:"notes,omitempty"`
}

type FlowFilter struct {
	ID       int64    `json:"id"`
	FlowID   int64    `json:"flow_id"`
	Type     string   `json:"type"`
	Operator string   `json:"operator"`
	Values   []string `json:"values"`
	Position int      `json:"position"`
	Status   string   `json:"status"`
}

type Stream struct {
	ID       int64  `json:"id"`
	FlowID   int64  `json:"flow_id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	Status   string `json:"status"`
}

type StreamDestination struct {
	ID              int64   `json:"id"`
	StreamID        int64   `json:"stream_id"`
	DestinationType string  `json:"destination_type"`
	DestinationID   *int64  `json:"destination_id,omitempty"`
	URL             *string `json:"url,omitempty"`
	Weight          int     `json:"weight"`
	Status          string  `json:"status"`
}

type ClickReportRow map[string]any

type CampaignConfig struct {
	ID     int64        `json:"id"`
	Name   string       `json:"name"`
	Slug   string       `json:"slug"`
	Alias  string       `json:"alias"`
	Status string       `json:"status"`
	Flows  []FlowConfig `json:"flows"`
}

type FlowConfig struct {
	ID      int64          `json:"id"`
	Name    string         `json:"name"`
	Filters []FilterConfig `json:"filters"`
	Streams []StreamConfig `json:"streams"`
}

type FilterConfig struct {
	Type     string   `json:"type"`
	Operator string   `json:"operator"`
	Values   []string `json:"values"`
}

type StreamConfig struct {
	ID           int64               `json:"id"`
	Name         string              `json:"name"`
	Destinations []DestinationConfig `json:"destinations"`
}

type DestinationConfig struct {
	ID     int64  `json:"id"`
	Type   string `json:"type"`
	URL    string `json:"url"`
	Weight int    `json:"weight"`
}

func Run() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, env("DATABASE_URL", "postgres://trafficone:trafficone@postgres:5432/trafficone?sslmode=disable"))
	if err != nil {
		log.Fatalf("connect postgres: %v", err)
	}
	defer db.Close()

	app := &App{
		db: db,
		redis: redis.NewClient(&redis.Options{
			Addr:     env("REDIS_ADDR", "redis:6379"),
			Password: env("REDIS_PASSWORD", ""),
		}),
		redisCampaignPrefix: env("REDIS_CAMPAIGN_PREFIX", "campaign:"),
		clickhouseURL:       strings.TrimRight(env("CLICKHOUSE_URL", "http://clickhouse:8123"), "/"),
		clickhouseDatabase:  env("CLICKHOUSE_DATABASE", "trafficone"),
		serverIP:            env("SERVER_IP", "127.0.0.1"),
		landerRoot:          env("LANDER_ROOT", "lander"),
	}

	if err := app.bootstrap(ctx); err != nil {
		log.Fatalf("bootstrap: %v", err)
	}
	if err := app.bootstrapClickHouse(ctx); err != nil {
		log.Printf("clickhouse bootstrap: %v", err)
	}
	go app.startDomainDNSChecker(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.health)
	mux.HandleFunc("GET /up", app.health)
	mux.HandleFunc("GET /api/domain-access", app.domainAccess)
	mux.HandleFunc("GET /api/admin-access-check", app.adminAccessCheck)
	mux.HandleFunc("GET /api/preview", app.preview)
	mux.HandleFunc("POST /api/auth/login", app.login)
	mux.HandleFunc("POST /api/auth/logout", app.auth(app.logout))
	mux.HandleFunc("GET /api/auth/me", app.auth(app.me))
	mux.HandleFunc("PATCH /api/profile/avatar", app.auth(app.updateProfileAvatar))
	mux.HandleFunc("POST /api/profile/2fa/setup", app.auth(app.setupTwoFactor))
	mux.HandleFunc("POST /api/profile/2fa/enable", app.auth(app.enableTwoFactor))
	mux.HandleFunc("POST /api/profile/2fa/disable", app.auth(app.disableTwoFactor))
	mux.HandleFunc("GET /api/team", app.auth(app.team))
	mux.HandleFunc("GET /api/team/users", app.auth(app.teamUsers))
	mux.HandleFunc("POST /api/team/users", app.auth(app.createTeamUser))
	mux.HandleFunc("PATCH /api/team/users/{id}", app.auth(app.updateTeamUser))
	mux.HandleFunc("DELETE /api/team/users/{id}", app.auth(app.deleteTeamUser))
	mux.HandleFunc("GET /api/groups", app.auth(app.listBuyerGroups))
	mux.HandleFunc("POST /api/groups", app.auth(app.createBuyerGroup))
	mux.HandleFunc("PATCH /api/groups/{id}", app.auth(app.updateBuyerGroup))
	mux.HandleFunc("DELETE /api/groups/{id}", app.auth(app.deleteBuyerGroup))
	mux.HandleFunc("POST /api/groups/{id}/buyers", app.auth(app.addBuyerGroupMember))
	mux.HandleFunc("DELETE /api/groups/{id}/buyers/{buyerId}", app.auth(app.removeBuyerGroupMember))
	mux.HandleFunc("GET /api/campaigns", app.auth(app.campaigns))
	mux.HandleFunc("POST /api/campaigns", app.auth(app.createCampaign))
	mux.HandleFunc("GET /api/campaigns/stats", app.auth(app.campaignStats))
	mux.HandleFunc("GET /api/campaigns/{id}", app.auth(app.getCampaign))
	mux.HandleFunc("PATCH /api/campaigns/{id}", app.auth(app.updateCampaign))
	mux.HandleFunc("POST /api/campaigns/{id}/compile", app.auth(app.compileCampaign))
	mux.HandleFunc("GET /api/traffic-sources", app.auth(app.trafficSources))
	mux.HandleFunc("POST /api/traffic-sources", app.auth(app.createTrafficSource))
	mux.HandleFunc("PATCH /api/traffic-sources/{id}", app.auth(app.updateTrafficSource))
	mux.HandleFunc("DELETE /api/traffic-sources/{id}", app.auth(app.deleteTrafficSource))
	mux.HandleFunc("GET /api/countries", app.auth(app.countries))
	mux.HandleFunc("GET /api/offers", app.auth(app.offers))
	mux.HandleFunc("POST /api/offers", app.auth(app.createOffer))
	mux.HandleFunc("GET /api/offers/{id}", app.auth(app.getOffer))
	mux.HandleFunc("PATCH /api/offers/{id}", app.auth(app.updateOffer))
	mux.HandleFunc("DELETE /api/offers/{id}", app.auth(app.deleteOffer))
	mux.HandleFunc("GET /api/offers/{id}/files", app.auth(app.offerFiles))
	mux.HandleFunc("GET /api/offers/{id}/files/content", app.auth(app.offerFileContent))
	mux.HandleFunc("PATCH /api/offers/{id}/files/content", app.auth(app.updateOfferFileContent))
	mux.HandleFunc("GET /api/offers/{id}/download", app.auth(app.downloadOffer))
	mux.HandleFunc("GET /api/landings", app.auth(app.landings))
	mux.HandleFunc("POST /api/landings", app.auth(app.createLanding))
	mux.HandleFunc("GET /api/landings/{id}", app.auth(app.getLanding))
	mux.HandleFunc("PATCH /api/landings/{id}", app.auth(app.updateLanding))
	mux.HandleFunc("DELETE /api/landings/{id}", app.auth(app.deleteLanding))
	mux.HandleFunc("GET /api/landings/{id}/files", app.auth(app.landingFiles))
	mux.HandleFunc("GET /api/landings/{id}/files/content", app.auth(app.landingFileContent))
	mux.HandleFunc("PATCH /api/landings/{id}/files/content", app.auth(app.updateLandingFileContent))
	mux.HandleFunc("GET /api/landings/{id}/download", app.auth(app.downloadLanding))
	mux.HandleFunc("GET /api/domains", app.auth(app.domains))
	mux.HandleFunc("POST /api/domains", app.auth(app.createDomain))
	mux.HandleFunc("PATCH /api/domains/{id}", app.auth(app.updateDomain))
	mux.HandleFunc("DELETE /api/domains/{id}", app.auth(app.deleteDomain))
	mux.HandleFunc("GET /api/domains/server-ip", app.auth(app.domainServerIP))
	mux.HandleFunc("GET /api/flows", app.auth(app.flows))
	mux.HandleFunc("POST /api/flows", app.auth(app.createFlow))
	mux.HandleFunc("PATCH /api/flows/{id}", app.auth(app.updateFlow))
	mux.HandleFunc("GET /api/flow-filters", app.auth(app.flowFilters))
	mux.HandleFunc("POST /api/flow-filters", app.auth(app.createFlowFilter))
	mux.HandleFunc("GET /api/streams", app.auth(app.streams))
	mux.HandleFunc("POST /api/streams", app.auth(app.createStream))
	mux.HandleFunc("GET /api/stream-destinations", app.auth(app.streamDestinations))
	mux.HandleFunc("POST /api/stream-destinations", app.auth(app.createStreamDestination))
	mux.HandleFunc("PATCH /api/stream-destinations/{id}", app.auth(app.updateStreamDestination))
	mux.HandleFunc("GET /api/dashboard", app.auth(app.dashboard))
	mux.HandleFunc("GET /api/reports/clicks", app.auth(app.reportClicks))
	mux.HandleFunc("GET /api/postback", app.postback)
	mux.HandleFunc("GET /postback", app.postback)
	mux.HandleFunc("GET /lead", app.postback)
	mux.HandleFunc("GET /ftd", app.postback)
	mux.HandleFunc("GET /r/{slug}", app.redirect)
	mux.HandleFunc("GET /{slug}", app.redirect)
	mux.HandleFunc("GET /lander/", app.serveLanding)
	mux.HandleFunc("GET /robots.txt", app.robots)
	mux.HandleFunc("GET /", app.trackerFallback)

	server := &http.Server{
		Addr:              ":8080",
		Handler:           app.cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Println("trafficone backend listening on :8080")
	log.Fatal(server.ListenAndServe())
}

func (app *App) bootstrap(ctx context.Context) error {
	schema, err := os.ReadFile("schema.sql")
	if err != nil {
		return err
	}

	var schemaErr error
	for attempt := 1; attempt <= 30; attempt++ {
		if _, schemaErr = app.db.Exec(ctx, string(schema)); schemaErr == nil {
			break
		}
		log.Printf("waiting for postgres, attempt %d/30: %v", attempt, schemaErr)
		time.Sleep(time.Second)
	}
	if schemaErr != nil {
		return schemaErr
	}

	if err := app.migrateBuyerGroups(ctx); err != nil {
		return err
	}

	adminEmail := env("ADMIN_EMAIL", "")
	adminPassword := env("ADMIN_PASSWORD", "")
	if adminEmail == "" || adminPassword == "" {
		return nil
	}

	var exists bool
	if err := app.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)", adminEmail).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	var teamID int64
	if err := app.db.QueryRow(ctx, "INSERT INTO teams (name) VALUES ($1) RETURNING id", env("ADMIN_TEAM", "TrafficOne Team")).Scan(&teamID); err != nil {
		return err
	}

	_, err = app.db.Exec(
		ctx,
		"INSERT INTO users (team_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'admin')",
		teamID,
		env("ADMIN_NAME", "Admin"),
		adminEmail,
		string(hash),
	)
	return err
}

func (app *App) bootstrapClickHouse(ctx context.Context) error {
	statements := []string{
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS event_id String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS subid String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS source String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS country String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS region String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS city String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS os String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS os_version String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS browser String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS browser_version String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS connection_type String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS device_type String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS device_model String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS bot UInt8 DEFAULT 0",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS unique_campaign UInt8 DEFAULT 1",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS unique_flow UInt8 DEFAULT 1",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS unique_global UInt8 DEFAULT 1",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS event_type String DEFAULT 'click'",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS site String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS x_requested_with String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS search_engine String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS keyword String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS visitor_code String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS ad_campaign_id String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS external_id String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS creative_id String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS cost Float64 DEFAULT 0",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS domain String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS language String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS ip_1_2_mask String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS ip_1_2_3_mask String DEFAULT ''",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS empty_referrer UInt8 DEFAULT 0",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS using_proxy UInt8 DEFAULT 0",
		"ALTER TABLE " + app.clickhouseDatabase + ".clicks ADD COLUMN IF NOT EXISTS landing_clicked UInt8 DEFAULT 0",
	}
	for index := 1; index <= 30; index++ {
		statements = append(statements, fmt.Sprintf("ALTER TABLE %s.clicks ADD COLUMN IF NOT EXISTS sub_id_%d String DEFAULT ''", app.clickhouseDatabase, index))
	}
	for _, statement := range statements {
		if err := app.execClickHouse(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (app *App) login(w http.ResponseWriter, r *http.Request) {
	if !app.adminAccessAllowed(r) {
		writeError(w, http.StatusForbidden, "Admin access is disabled for this domain")
		return
	}

	var input struct {
		Email         string `json:"email"`
		Password      string `json:"password"`
		TwoFactorCode string `json:"two_factor_code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	var user User
	var passwordHash string
	var teamName string
	var managerID pgtype.Int8
	var avatarURL pgtype.Text
	var totpSecret pgtype.Text
	err := app.db.QueryRow(
		r.Context(),
		`SELECT u.id, u.team_id, u.name, u.email, u.password_hash, u.role,
		        u.avatar_url, u.two_factor_enabled, u.totp_secret, u.manager_id, t.name
		 FROM users u
		 JOIN teams t ON t.id = u.team_id
		 WHERE u.email = $1`,
		strings.ToLower(input.Email),
	).Scan(&user.ID, &user.TeamID, &user.Name, &user.Email, &passwordHash, &user.Role, &avatarURL, &user.TwoFactorEnabled, &totpSecret, &managerID, &teamName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	user.AvatarURL = textPtr(avatarURL)
	if managerID.Valid {
		user.ManagerID = &managerID.Int64
	}

	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	if user.TwoFactorEnabled {
		if !totpSecret.Valid || strings.TrimSpace(totpSecret.String) == "" {
			writeError(w, http.StatusUnauthorized, "Invalid two-factor setup")
			return
		}
		if strings.TrimSpace(input.TwoFactorCode) == "" {
			writeJSON(w, http.StatusOK, map[string]any{"requires_2fa": true})
			return
		}
		if !validTOTPCode(totpSecret.String, input.TwoFactorCode, time.Now()) {
			writeError(w, http.StatusUnauthorized, "Invalid two-factor code")
			return
		}
	}

	token, tokenHash, err := newToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create token")
		return
	}

	if _, err := app.db.Exec(r.Context(), "INSERT INTO api_tokens (user_id, token_hash) VALUES ($1, $2)", user.ID, tokenHash); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not persist token")
		return
	}

	user.Team = &Team{ID: user.TeamID, Name: teamName}
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": token})
}

func (app *App) logout(w http.ResponseWriter, r *http.Request, user User) {
	token := bearerToken(r)
	if token != "" {
		_, _ = app.db.Exec(r.Context(), "DELETE FROM api_tokens WHERE token_hash = $1", hashToken(token))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (app *App) me(w http.ResponseWriter, _ *http.Request, user User) {
	writeJSON(w, http.StatusOK, user)
}

func (app *App) updateProfileAvatar(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		AvatarURL *string `json:"avatar_url"`
		Clear     bool    `json:"clear"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	var avatar *string
	if !input.Clear {
		if input.AvatarURL == nil {
			writeError(w, http.StatusUnprocessableEntity, "Avatar image is required")
			return
		}
		normalized, ok := normalizeAvatarDataURL(*input.AvatarURL)
		if !ok {
			writeError(w, http.StatusUnprocessableEntity, "Avatar must be a PNG, JPEG, WebP, or GIF image under 2 MB")
			return
		}
		avatar = &normalized
	}

	var updated User
	var managerID pgtype.Int8
	var avatarURL pgtype.Text
	err := app.db.QueryRow(
		r.Context(),
		`UPDATE users SET avatar_url = $1, updated_at = now()
		 WHERE id = $2 AND team_id = $3
		 RETURNING id, team_id, name, email, role, avatar_url, two_factor_enabled, manager_id`,
		avatar,
		user.ID,
		user.TeamID,
	).Scan(&updated.ID, &updated.TeamID, &updated.Name, &updated.Email, &updated.Role, &avatarURL, &updated.TwoFactorEnabled, &managerID)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	updated.AvatarURL = textPtr(avatarURL)
	if managerID.Valid {
		updated.ManagerID = &managerID.Int64
	}
	updated.Team = user.Team

	writeJSON(w, http.StatusOK, updated)
}

func (app *App) setupTwoFactor(w http.ResponseWriter, r *http.Request, user User) {
	secret, err := newTOTPSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create two-factor secret")
		return
	}

	tag, err := app.db.Exec(
		r.Context(),
		"UPDATE users SET totp_secret = $1, two_factor_enabled = false, updated_at = now() WHERE id = $2 AND team_id = $3",
		secret,
		user.ID,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save two-factor secret")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	otpauthURL := totpAuthURL("TrafficOne", user.Email, secret)
	qrPNG, err := qrcode.Encode(otpauthURL, qrcode.Medium, 192)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create two-factor QR code")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"secret":      secret,
		"otpauth_url": otpauthURL,
		"qr_data_url": "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrPNG),
	})
}

func (app *App) enableTwoFactor(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	var secret pgtype.Text
	if err := app.db.QueryRow(r.Context(), "SELECT totp_secret FROM users WHERE id = $1 AND team_id = $2", user.ID, user.TeamID).Scan(&secret); err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if !secret.Valid || strings.TrimSpace(secret.String) == "" {
		writeError(w, http.StatusUnprocessableEntity, "Start two-factor setup first")
		return
	}
	if !validTOTPCode(secret.String, input.Code, time.Now()) {
		writeError(w, http.StatusUnprocessableEntity, "Invalid two-factor code")
		return
	}

	updated, err := app.updateTwoFactorEnabled(r.Context(), user, true, false)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (app *App) disableTwoFactor(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	var secret pgtype.Text
	var enabled bool
	if err := app.db.QueryRow(r.Context(), "SELECT totp_secret, two_factor_enabled FROM users WHERE id = $1 AND team_id = $2", user.ID, user.TeamID).Scan(&secret, &enabled); err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if enabled && (!secret.Valid || !validTOTPCode(secret.String, input.Code, time.Now())) {
		writeError(w, http.StatusUnprocessableEntity, "Invalid two-factor code")
		return
	}

	updated, err := app.updateTwoFactorEnabled(r.Context(), user, false, true)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (app *App) updateTwoFactorEnabled(ctx context.Context, user User, enabled bool, clearSecret bool) (User, error) {
	var updated User
	var avatarURL pgtype.Text
	var managerID pgtype.Int8
	err := app.db.QueryRow(
		ctx,
		`UPDATE users SET
		   two_factor_enabled = $1,
		   totp_secret = CASE WHEN $2::boolean THEN NULL ELSE totp_secret END,
		   updated_at = now()
		 WHERE id = $3 AND team_id = $4
		 RETURNING id, team_id, name, email, role, avatar_url, two_factor_enabled, manager_id`,
		enabled,
		clearSecret,
		user.ID,
		user.TeamID,
	).Scan(&updated.ID, &updated.TeamID, &updated.Name, &updated.Email, &updated.Role, &avatarURL, &updated.TwoFactorEnabled, &managerID)
	if err != nil {
		return User{}, err
	}
	updated.AvatarURL = textPtr(avatarURL)
	if managerID.Valid {
		updated.ManagerID = &managerID.Int64
	}
	updated.Team = user.Team
	return updated, nil
}

func (app *App) team(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(r.Context(), "SELECT id, name, email, role, avatar_url, two_factor_enabled, manager_id FROM users WHERE team_id = $1 ORDER BY name", user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load team")
		return
	}
	defer rows.Close()

	members := []User{}
	for rows.Next() {
		var member User
		var managerID pgtype.Int8
		var avatarURL pgtype.Text
		member.TeamID = user.TeamID
		if err := rows.Scan(&member.ID, &member.Name, &member.Email, &member.Role, &avatarURL, &member.TwoFactorEnabled, &managerID); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read team user")
			return
		}
		member.AvatarURL = textPtr(avatarURL)
		if managerID.Valid {
			member.ManagerID = &managerID.Int64
		}
		members = append(members, member)
	}

	team := user.Team
	team.Users = members
	writeJSON(w, http.StatusOK, team)
}

func (app *App) teamUsers(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(r.Context(), "SELECT id, team_id, name, email, role, avatar_url, two_factor_enabled, manager_id FROM users WHERE team_id = $1 ORDER BY name", user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load users")
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var item User
		var managerID pgtype.Int8
		var avatarURL pgtype.Text
		if err := rows.Scan(&item.ID, &item.TeamID, &item.Name, &item.Email, &item.Role, &avatarURL, &item.TwoFactorEnabled, &managerID); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read user")
			return
		}
		item.AvatarURL = textPtr(avatarURL)
		if managerID.Valid {
			item.ManagerID = &managerID.Int64
		}
		users = append(users, item)
	}
	writeJSON(w, http.StatusOK, users)
}

func (app *App) createTeamUser(w http.ResponseWriter, r *http.Request, actor User) {
	if !canManageUsers(actor.Role) {
		writeError(w, http.StatusForbidden, "Only admin and teamlead users can manage users")
		return
	}

	var input struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		Role      string `json:"role"`
		ManagerID *int64 `json:"manager_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validRole(input.Role) || strings.TrimSpace(input.Password) == "" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid user payload")
		return
	}
	managerID := input.ManagerID
	if actor.Role == "teamlead" && input.Role == "buyer" && managerID == nil {
		managerID = &actor.ID
	}
	if managerID != nil {
		if input.Role != "buyer" {
			writeError(w, http.StatusUnprocessableEntity, "Only buyers can be assigned to a teamlead")
			return
		}
		if !app.isTeamlead(r.Context(), actor.TeamID, *managerID) {
			writeError(w, http.StatusUnprocessableEntity, "Manager must be a teamlead")
			return
		}
		if actor.Role == "teamlead" && *managerID != actor.ID {
			writeError(w, http.StatusForbidden, "Teamlead users can only assign buyers to themselves")
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not hash password")
		return
	}

	var user User
	err = app.db.QueryRow(
		r.Context(),
		`INSERT INTO users (team_id, name, email, password_hash, role, manager_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, team_id, name, email, role, avatar_url, two_factor_enabled, manager_id`,
		actor.TeamID,
		input.Name,
		strings.ToLower(input.Email),
		string(hash),
		input.Role,
		managerID,
	).Scan(&user.ID, &user.TeamID, &user.Name, &user.Email, &user.Role, avatarScanTarget(&user), &user.TwoFactorEnabled, managerIDScanTarget(&user))
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

func (app *App) updateTeamUser(w http.ResponseWriter, r *http.Request, actor User) {
	if !canManageUsers(actor.Role) {
		writeError(w, http.StatusForbidden, "Only admin and teamlead users can manage users")
		return
	}

	id, ok := pathID(w, r)
	if !ok {
		return
	}

	var input struct {
		Name           *string `json:"name"`
		Email          *string `json:"email"`
		Password       *string `json:"password"`
		Role           *string `json:"role"`
		ManagerID      *int64  `json:"manager_id"`
		ClearManagerID bool    `json:"clear_manager_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Role != nil && !validRole(*input.Role) {
		writeError(w, http.StatusUnprocessableEntity, "Invalid role")
		return
	}
	if input.ManagerID != nil {
		if !app.isTeamlead(r.Context(), actor.TeamID, *input.ManagerID) {
			writeError(w, http.StatusUnprocessableEntity, "Manager must be a teamlead")
			return
		}
		if actor.Role == "teamlead" && *input.ManagerID != actor.ID {
			writeError(w, http.StatusForbidden, "Teamlead users can only assign buyers to themselves")
			return
		}
	}

	passwordHash := (*string)(nil)
	if input.Password != nil && *input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not hash password")
			return
		}
		hashString := string(hash)
		passwordHash = &hashString
	}

	var user User
	err := app.db.QueryRow(
		r.Context(),
		`UPDATE users SET
		 name = COALESCE($1::text, name),
		 email = COALESCE($2::text, email),
		 password_hash = COALESCE($3::text, password_hash),
		 role = COALESCE($4::text, role),
		 manager_id = CASE WHEN $7::boolean THEN NULL ELSE COALESCE($8::bigint, manager_id) END,
		 updated_at = now()
		 WHERE id = $5 AND team_id = $6
		 RETURNING id, team_id, name, email, role, avatar_url, two_factor_enabled, manager_id`,
		input.Name,
		lowerPtr(input.Email),
		passwordHash,
		input.Role,
		id,
		actor.TeamID,
		input.ClearManagerID,
		input.ManagerID,
	).Scan(&user.ID, &user.TeamID, &user.Name, &user.Email, &user.Role, avatarScanTarget(&user), &user.TwoFactorEnabled, managerIDScanTarget(&user))
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (app *App) deleteTeamUser(w http.ResponseWriter, r *http.Request, actor User) {
	if !canManageUsers(actor.Role) {
		writeError(w, http.StatusForbidden, "Only admin and teamlead users can manage users")
		return
	}

	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if id == actor.ID {
		writeError(w, http.StatusForbidden, "You cannot delete your own account")
		return
	}

	tag, err := app.db.Exec(r.Context(), "DELETE FROM users WHERE id = $1 AND team_id = $2", id, actor.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete user")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) campaigns(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(r.Context(), campaignSelectQuery("c.team_id = $1 ORDER BY c.id DESC"), user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load campaigns")
		return
	}
	defer rows.Close()

	items := []Campaign{}
	for rows.Next() {
		item, err := scanCampaign(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read campaign")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createCampaign(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		Name               string            `json:"name"`
		Slug               string            `json:"slug"`
		DomainID           *int64            `json:"domain_id"`
		TrafficSourceID    *int64            `json:"traffic_source_id"`
		Alias              string            `json:"alias"`
		GroupName          string            `json:"group_name"`
		SourceName         string            `json:"source_name"`
		FlowRotation       string            `json:"flow_rotation"`
		CostModel          string            `json:"cost_model"`
		CostValue          float64           `json:"cost_value"`
		CostCurrency       string            `json:"cost_currency"`
		CostFromParam      bool              `json:"cost_from_param"`
		TrafficLoss        int               `json:"traffic_loss"`
		Uniqueness         string            `json:"uniqueness"`
		UseCookies         bool              `json:"use_cookies"`
		UniquenessTTLHours int               `json:"uniqueness_ttl_hours"`
		Parameters         map[string]string `json:"parameters"`
		S2SPostbacks       map[string]string `json:"s2s_postbacks"`
		Notes              string            `json:"notes"`
		Status             string            `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusUnprocessableEntity, "Campaign name is required")
		return
	}
	if input.Status == "" {
		input.Status = "active"
	}
	normalized := normalizeCampaignInput(input.FlowRotation, input.CostModel, input.CostCurrency, input.Uniqueness, input.UniquenessTTLHours)
	alias := normalizeAlias(input.Alias)
	if alias == "" {
		alias = randomAlias()
	}
	slug := strings.TrimSpace(input.Slug)
	if slug == "" {
		slug = alias
	}
	if input.DomainID != nil && !app.ownsDomain(r.Context(), user.TeamID, *input.DomainID) {
		writeError(w, http.StatusNotFound, "Domain not found")
		return
	}
	sourceName := nullableTrim(input.SourceName)
	if input.TrafficSourceID != nil {
		trafficSource, err := app.getTrafficSourceForTeam(r.Context(), user.TeamID, *input.TrafficSourceID)
		if err != nil {
			writeError(w, http.StatusNotFound, "Traffic source not found")
			return
		}
		sourceName = &trafficSource.Name
	}

	parameters := jsonMapValue(input.Parameters)
	s2sPostbacks := jsonMapValue(input.S2SPostbacks)
	item, err := scanCampaign(app.db.QueryRow(
		r.Context(),
		`WITH inserted AS (
		   INSERT INTO campaigns (
		     team_id, user_id, name, slug, domain_id, traffic_source_id, alias, group_name, source_name,
		     flow_rotation, cost_model, cost_value, cost_currency, cost_from_param,
		     traffic_loss, uniqueness, use_cookies, uniqueness_ttl_hours,
		     parameters, s2s_postbacks, notes, status
		   )
		   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
		   RETURNING *
		 )
		 `+campaignSelectFrom("inserted"),
		user.TeamID,
		user.ID,
		name,
		slug,
		input.DomainID,
		input.TrafficSourceID,
		alias,
		nullableTrim(input.GroupName),
		sourceName,
		normalized.flowRotation,
		normalized.costModel,
		input.CostValue,
		normalized.costCurrency,
		input.CostFromParam,
		input.TrafficLoss,
		normalized.uniqueness,
		input.UseCookies,
		normalized.uniquenessTTLHours,
		parameters,
		s2sPostbacks,
		nullableTrim(input.Notes),
		input.Status,
	))
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) getCampaign(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	item, err := scanCampaign(app.db.QueryRow(r.Context(), campaignSelectQuery("c.team_id = $1 AND c.id = $2"), user.TeamID, id))
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (app *App) updateCampaign(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	var input struct {
		Name               *string           `json:"name"`
		DomainID           *int64            `json:"domain_id"`
		ClearDomainID      bool              `json:"clear_domain_id"`
		Alias              *string           `json:"alias"`
		GroupName          *string           `json:"group_name"`
		SourceName         *string           `json:"source_name"`
		FlowRotation       *string           `json:"flow_rotation"`
		CostModel          *string           `json:"cost_model"`
		CostValue          *float64          `json:"cost_value"`
		CostCurrency       *string           `json:"cost_currency"`
		CostFromParam      *bool             `json:"cost_from_param"`
		TrafficLoss        *int              `json:"traffic_loss"`
		Uniqueness         *string           `json:"uniqueness"`
		UseCookies         *bool             `json:"use_cookies"`
		UniquenessTTLHours *int              `json:"uniqueness_ttl_hours"`
		Parameters         map[string]string `json:"parameters"`
		S2SPostbacks       map[string]string `json:"s2s_postbacks"`
		Notes              *string           `json:"notes"`
		Status             *string           `json:"status"`
		TrafficSourceID    *int64            `json:"traffic_source_id"`
		ClearTrafficSource bool              `json:"clear_traffic_source"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.DomainID != nil && !app.ownsDomain(r.Context(), user.TeamID, *input.DomainID) {
		writeError(w, http.StatusNotFound, "Domain not found")
		return
	}
	if input.TrafficSourceID != nil && !app.ownsTrafficSource(r.Context(), user.TeamID, *input.TrafficSourceID) {
		writeError(w, http.StatusNotFound, "Traffic source not found")
		return
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			writeError(w, http.StatusUnprocessableEntity, "Campaign name is required")
			return
		}
		input.Name = &name
	}
	alias := normalizeAliasPtr(input.Alias)

	var domainID any = input.DomainID
	if input.ClearDomainID {
		domainID = nil
	}
	var trafficSourceID any = input.TrafficSourceID
	if input.ClearTrafficSource {
		trafficSourceID = nil
	}
	sourceName := nullableTrimPtr(input.SourceName)
	if input.TrafficSourceID != nil {
		trafficSource, err := app.getTrafficSourceForTeam(r.Context(), user.TeamID, *input.TrafficSourceID)
		if err != nil {
			writeError(w, http.StatusNotFound, "Traffic source not found")
			return
		}
		sourceName = &trafficSource.Name
	}
	if input.ClearTrafficSource && input.SourceName == nil {
		emptySource := ""
		sourceName = &emptySource
	}
	flowRotation := normalizeOptional(input.FlowRotation, "position", map[string]bool{"position": true, "weight": true})
	costModel := normalizeOptional(input.CostModel, "cpc", map[string]bool{"cpc": true, "cpm": true})
	costCurrency := normalizeCurrencyPtr(input.CostCurrency)
	uniqueness := normalizeOptional(input.Uniqueness, "ip_ua", map[string]bool{"ip_ua": true, "ip": true, "parameter": true})
	ttl := input.UniquenessTTLHours
	if ttl != nil && *ttl <= 0 {
		defaultTTL := 24
		ttl = &defaultTTL
	}
	parameters := jsonMapPtr(input.Parameters)
	s2sPostbacks := jsonMapPtr(input.S2SPostbacks)

	item, err := scanCampaign(app.db.QueryRow(
		r.Context(),
		`WITH updated AS (
		   UPDATE campaigns SET
		     name = COALESCE($1::text, name),
		     domain_id = CASE WHEN $19::boolean THEN NULL ELSE COALESCE($2::bigint, domain_id) END,
		     alias = COALESCE($3::text, alias),
		     slug = COALESCE($3::text, slug),
		     group_name = COALESCE($4::text, group_name),
		     source_name = COALESCE($5::text, source_name),
		     flow_rotation = COALESCE($6::text, flow_rotation),
		     cost_model = COALESCE($7::text, cost_model),
		     cost_value = COALESCE($8::numeric, cost_value),
		     cost_currency = COALESCE($9::text, cost_currency),
		     cost_from_param = COALESCE($10::boolean, cost_from_param),
		     traffic_loss = COALESCE($11::integer, traffic_loss),
		     uniqueness = COALESCE($12::text, uniqueness),
		     use_cookies = COALESCE($13::boolean, use_cookies),
		     uniqueness_ttl_hours = COALESCE($14::integer, uniqueness_ttl_hours),
		     parameters = COALESCE($15::jsonb, parameters),
		     s2s_postbacks = COALESCE($16::jsonb, s2s_postbacks),
		     notes = COALESCE($17::text, notes),
		     status = COALESCE($18::text, status),
		     traffic_source_id = CASE WHEN $21::boolean THEN NULL ELSE COALESCE($20::bigint, traffic_source_id) END,
		     updated_at = now()
		   WHERE id = $22 AND team_id = $23
		   RETURNING *
		 )
		 `+campaignSelectFrom("updated"),
		input.Name,
		domainID,
		alias,
		nullableTrimPtr(input.GroupName),
		sourceName,
		flowRotation,
		costModel,
		input.CostValue,
		costCurrency,
		input.CostFromParam,
		input.TrafficLoss,
		uniqueness,
		input.UseCookies,
		ttl,
		parameters,
		s2sPostbacks,
		nullableTrimPtr(input.Notes),
		input.Status,
		input.ClearDomainID,
		trafficSourceID,
		input.ClearTrafficSource,
		id,
		user.TeamID,
	))
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (app *App) trafficSources(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT id, team_id, user_id, name, postback_url, parameters, notes
		 FROM traffic_sources
		 WHERE team_id = $1
		 ORDER BY id DESC`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load traffic sources")
		return
	}
	defer rows.Close()

	items := []TrafficSource{}
	for rows.Next() {
		item, err := scanTrafficSource(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read traffic source")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createTrafficSource(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		Name        string            `json:"name"`
		PostbackURL string            `json:"postback_url"`
		Parameters  map[string]string `json:"parameters"`
		Notes       string            `json:"notes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusUnprocessableEntity, "Traffic source name is required")
		return
	}

	item, err := scanTrafficSource(app.db.QueryRow(
		r.Context(),
		`INSERT INTO traffic_sources (team_id, user_id, name, postback_url, parameters, notes)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, team_id, user_id, name, postback_url, parameters, notes`,
		user.TeamID,
		user.ID,
		name,
		nullableTrim(input.PostbackURL),
		jsonMapValue(input.Parameters),
		nullableTrim(input.Notes),
	))
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) updateTrafficSource(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	var input struct {
		Name        *string           `json:"name"`
		PostbackURL *string           `json:"postback_url"`
		Parameters  map[string]string `json:"parameters"`
		Notes       *string           `json:"notes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			writeError(w, http.StatusUnprocessableEntity, "Traffic source name is required")
			return
		}
		input.Name = &name
	}

	item, err := scanTrafficSource(app.db.QueryRow(
		r.Context(),
		`UPDATE traffic_sources SET
		     name = COALESCE($1::text, name),
		     postback_url = COALESCE($2::text, postback_url),
		     parameters = COALESCE($3::jsonb, parameters),
		     notes = COALESCE($4::text, notes),
		     updated_at = now()
		   WHERE id = $5 AND team_id = $6
		   RETURNING id, team_id, user_id, name, postback_url, parameters, notes`,
		input.Name,
		nullableTrimPtr(input.PostbackURL),
		jsonMapPtr(input.Parameters),
		nullableTrimPtr(input.Notes),
		id,
		user.TeamID,
	))
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (app *App) deleteTrafficSource(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	if !app.ownsTrafficSource(r.Context(), user.TeamID, id) {
		writeError(w, http.StatusNotFound, "Traffic source not found")
		return
	}
	_, err := app.db.Exec(
		r.Context(),
		`UPDATE campaigns
		    SET traffic_source_id = NULL,
		        source_name = NULL,
		        updated_at = now()
		  WHERE team_id = $2 AND traffic_source_id = $1`,
		id,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete traffic source")
		return
	}
	_, err = app.db.Exec(r.Context(), "DELETE FROM traffic_sources WHERE id = $1 AND team_id = $2", id, user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete traffic source")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) landings(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT id, team_id, user_id, name, url, status, group_name, landing_type, local_path
		 FROM landings
		 WHERE team_id = $1
		 ORDER BY id DESC`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load landings")
		return
	}
	defer rows.Close()

	items := []Landing{}
	for rows.Next() {
		item, err := app.scanLanding(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read landing")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createLanding(w http.ResponseWriter, r *http.Request, user User) {
	input, closeFile, ok := parseLandingCreateInput(w, r)
	if !ok {
		return
	}
	if closeFile != nil {
		defer closeFile()
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusUnprocessableEntity, "Landing name is required")
		return
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if input.Status != "active" && input.Status != "paused" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid status")
		return
	}

	folder := input.Folder
	if strings.TrimSpace(folder) == "" {
		folder = name
	}
	localPath, ok := normalizeLandingFolder(folder)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "Invalid folder")
		return
	}
	if input.ZipFile != nil {
		if err := app.extractLandingZip(localPath, input.ZipFile, input.ZipSize); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	} else {
		if err := app.createLandingScaffold(localPath, name); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not create landing files")
			return
		}
	}

	var item Landing
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO landings (team_id, user_id, name, url, status, group_name, landing_type, local_path)
		 VALUES ($1, $2, $3, $4, $5, $6, 'local', $7)
		 RETURNING id, team_id, user_id, name, url, status, group_name, landing_type, local_path`,
		user.TeamID,
		user.ID,
		name,
		landingURL(localPath),
		input.Status,
		nullableTrim(input.GroupName),
		localPath,
	).Scan(landingScanTargets(&item)...)
	if err != nil {
		_ = os.RemoveAll(app.landingDir(localPath))
		writeDBError(w, err)
		return
	}
	app.finishLanding(&item)

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) domains(w http.ResponseWriter, r *http.Request, user User) {
	app.refreshDomainDNSStatuses(r.Context())

	rows, err := app.db.Query(
		r.Context(),
		`SELECT d.id, d.team_id, d.user_id, d.domain, d.group_name, d.status,
		        d.allow_indexing, d.allow_admin_access, d.https_only,
		        d.index_campaign_id, c.name, c.slug,
		        CASE WHEN d.index_campaign_id IS NULL THEN 0 ELSE 1 END AS campaigns_count
		 FROM domains d
		 LEFT JOIN campaigns c ON c.id = d.index_campaign_id AND c.team_id = d.team_id
		 WHERE d.team_id = $1
		 ORDER BY d.id DESC`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load domains")
		return
	}
	defer rows.Close()

	items := []Domain{}
	for rows.Next() {
		item, err := scanDomain(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read domain")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createDomain(w http.ResponseWriter, r *http.Request, user User) {
	var input domainCreateInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.IndexCampaignID != nil && !app.ownsCampaign(r.Context(), user.TeamID, *input.IndexCampaignID) {
		writeError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	names := parseDomains(input.Domain)
	if len(names) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "Domain is required")
		return
	}

	items := []Domain{}
	for _, name := range names {
		item, err := app.insertDomain(r.Context(), user, name, input)
		if err != nil {
			writeDBError(w, err)
			return
		}
		items = append(items, item)
	}

	writeJSON(w, http.StatusCreated, items)
}

func (app *App) updateDomain(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	var input struct {
		Domain           *string `json:"domain"`
		GroupName        *string `json:"group_name"`
		AllowIndexing    *bool   `json:"allow_indexing"`
		AllowAdminAccess *bool   `json:"allow_admin_access"`
		HTTPSOnly        *bool   `json:"https_only"`
		IndexCampaignID  *int64  `json:"index_campaign_id"`
		ClearIndexPage   bool    `json:"clear_index_page"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.IndexCampaignID != nil && !app.ownsCampaign(r.Context(), user.TeamID, *input.IndexCampaignID) {
		writeError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	domainName := (*string)(nil)
	status := (*string)(nil)
	if input.Domain != nil {
		normalized, valid := normalizeDomain(*input.Domain)
		if !valid {
			writeError(w, http.StatusUnprocessableEntity, "Invalid domain")
			return
		}
		domainName = &normalized
		checkedStatus := app.domainDNSStatus(r.Context(), normalized)
		status = &checkedStatus
	}

	var indexCampaignID any = input.IndexCampaignID
	if input.ClearIndexPage {
		indexCampaignID = nil
	}

	item, err := app.updateDomainRow(
		r.Context(),
		user.TeamID,
		id,
		domainName,
		nullableTrimPtr(input.GroupName),
		status,
		input.AllowIndexing,
		input.AllowAdminAccess,
		input.HTTPSOnly,
		indexCampaignID,
		input.ClearIndexPage,
	)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (app *App) deleteDomain(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	tag, err := app.db.Exec(r.Context(), "DELETE FROM domains WHERE id = $1 AND team_id = $2", id, user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete domain")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Domain not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) domainServerIP(w http.ResponseWriter, _ *http.Request, _ User) {
	writeJSON(w, http.StatusOK, map[string]string{"server_ip": app.serverIP})
}

func (app *App) domainAccess(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"admin_access_allowed": app.adminAccessAllowed(r)})
}

func (app *App) adminAccessCheck(w http.ResponseWriter, r *http.Request) {
	if !app.adminAccessAllowed(r) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type domainCreateInput struct {
	Domain           string `json:"domain"`
	GroupName        string `json:"group_name"`
	AllowIndexing    bool   `json:"allow_indexing"`
	AllowAdminAccess bool   `json:"allow_admin_access"`
	HTTPSOnly        bool   `json:"https_only"`
	IndexCampaignID  *int64 `json:"index_campaign_id"`
}

func (app *App) insertDomain(ctx context.Context, user User, domainName string, input domainCreateInput) (Domain, error) {
	groupName := nullableTrim(input.GroupName)
	status := app.domainDNSStatus(ctx, domainName)
	return scanDomain(app.db.QueryRow(
		ctx,
		`WITH inserted AS (
		   INSERT INTO domains (
		     team_id, user_id, domain, group_name, status,
		     allow_indexing, allow_admin_access, https_only, index_campaign_id
		   )
		   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		   RETURNING *
		 )
		 SELECT d.id, d.team_id, d.user_id, d.domain, d.group_name, d.status,
		        d.allow_indexing, d.allow_admin_access, d.https_only,
		        d.index_campaign_id, c.name, c.slug,
		        CASE WHEN d.index_campaign_id IS NULL THEN 0 ELSE 1 END
		 FROM inserted d
		 LEFT JOIN campaigns c ON c.id = d.index_campaign_id AND c.team_id = d.team_id`,
		user.TeamID,
		user.ID,
		domainName,
		groupName,
		status,
		input.AllowIndexing,
		input.AllowAdminAccess,
		input.HTTPSOnly,
		input.IndexCampaignID,
	))
}

func (app *App) updateDomainRow(
	ctx context.Context,
	teamID int64,
	id int64,
	domainName *string,
	groupName *string,
	status *string,
	allowIndexing *bool,
	allowAdminAccess *bool,
	httpsOnly *bool,
	indexCampaignID any,
	clearIndexPage bool,
) (Domain, error) {
	return scanDomain(app.db.QueryRow(
		ctx,
		`WITH updated AS (
		   UPDATE domains SET
		     domain = COALESCE($1::text, domain),
		     group_name = COALESCE($2::text, group_name),
		     status = COALESCE($3::text, status),
		     allow_indexing = COALESCE($4::boolean, allow_indexing),
		     allow_admin_access = COALESCE($5::boolean, allow_admin_access),
		     https_only = COALESCE($6::boolean, https_only),
		     index_campaign_id = CASE WHEN $8::boolean THEN NULL ELSE COALESCE($7::bigint, index_campaign_id) END,
		     updated_at = now()
		   WHERE id = $9 AND team_id = $10
		   RETURNING *
		 )
		 SELECT d.id, d.team_id, d.user_id, d.domain, d.group_name, d.status,
		        d.allow_indexing, d.allow_admin_access, d.https_only,
		        d.index_campaign_id, c.name, c.slug,
		        CASE WHEN d.index_campaign_id IS NULL THEN 0 ELSE 1 END
		 FROM updated d
		 LEFT JOIN campaigns c ON c.id = d.index_campaign_id AND c.team_id = d.team_id`,
		domainName,
		groupName,
		status,
		allowIndexing,
		allowAdminAccess,
		httpsOnly,
		indexCampaignID,
		clearIndexPage,
		id,
		teamID,
	))
}

func (app *App) startDomainDNSChecker(ctx context.Context) {
	app.refreshDomainDNSStatuses(ctx)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			app.refreshDomainDNSStatuses(ctx)
		}
	}
}

func (app *App) refreshDomainDNSStatuses(ctx context.Context) {
	rows, err := app.db.Query(ctx, "SELECT id, domain, status FROM domains WHERE status <> 'disabled'")
	if err != nil {
		log.Printf("domain dns check load: %v", err)
		return
	}
	defer rows.Close()

	type pendingDomain struct {
		id     int64
		domain string
		status string
	}

	items := []pendingDomain{}
	for rows.Next() {
		var item pendingDomain
		if err := rows.Scan(&item.id, &item.domain, &item.status); err != nil {
			log.Printf("domain dns check scan: %v", err)
			return
		}
		items = append(items, item)
	}

	for _, item := range items {
		nextStatus := app.domainDNSStatus(ctx, item.domain)
		if nextStatus == item.status {
			continue
		}
		if _, err := app.db.Exec(ctx, "UPDATE domains SET status = $1, updated_at = now() WHERE id = $2", nextStatus, item.id); err != nil {
			log.Printf("domain dns check update %s: %v", item.domain, err)
		}
	}
}

func (app *App) domainDNSStatus(parent context.Context, domain string) string {
	if app.domainPointsToServer(parent, domain) {
		return "ok"
	}
	return "awaiting_dns"
}

func (app *App) domainPointsToServer(parent context.Context, domain string) bool {
	serverIP := net.ParseIP(app.serverIP)
	if serverIP == nil {
		return false
	}

	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()

	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, domain)
	if err != nil {
		return false
	}

	for _, address := range addresses {
		if address.IP.Equal(serverIP) || isCloudflareProxyIP(address.IP) {
			return true
		}
	}
	return false
}

func isCloudflareProxyIP(ip net.IP) bool {
	for _, cidr := range cloudflareProxyCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

var cloudflareProxyCIDRs = parseCIDRs([]string{
	"173.245.48.0/20",
	"103.21.244.0/22",
	"103.22.200.0/22",
	"103.31.4.0/22",
	"141.101.64.0/18",
	"108.162.192.0/18",
	"190.93.240.0/20",
	"188.114.96.0/20",
	"197.234.240.0/22",
	"198.41.128.0/17",
	"162.158.0.0/15",
	"104.16.0.0/13",
	"104.24.0.0/14",
	"172.64.0.0/13",
	"131.0.72.0/22",
	"2400:cb00::/32",
	"2606:4700::/32",
	"2803:f800::/32",
	"2405:b500::/32",
	"2405:8100::/32",
	"2a06:98c0::/29",
	"2c0f:f248::/32",
})

func parseCIDRs(values []string) []*net.IPNet {
	ranges := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		_, cidr, err := net.ParseCIDR(value)
		if err == nil {
			ranges = append(ranges, cidr)
		}
	}
	return ranges
}

func (app *App) flows(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT f.id, f.campaign_id, f.name, f.flow_type, f.position, f.collect_clicks, f.status, f.notes
		 FROM flows f
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE c.team_id = $1
		 ORDER BY f.position, f.id`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load flows")
		return
	}
	defer rows.Close()

	items := []Flow{}
	for rows.Next() {
		item, err := scanFlow(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read flow")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createFlow(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		CampaignID    int64  `json:"campaign_id"`
		Name          string `json:"name"`
		FlowType      string `json:"flow_type"`
		Position      int    `json:"position"`
		CollectClicks *bool  `json:"collect_clicks"`
		Status        string `json:"status"`
		Notes         string `json:"notes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Name) == "" {
		writeError(w, http.StatusUnprocessableEntity, "Flow name is required")
		return
	}
	if input.FlowType == "" {
		input.FlowType = "regular"
	}
	if input.FlowType != "regular" && input.FlowType != "default" && input.FlowType != "forced" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid flow type")
		return
	}
	if input.Status == "" {
		input.Status = "active"
	}
	collectClicks := true
	if input.CollectClicks != nil {
		collectClicks = *input.CollectClicks
	}
	if !app.ownsCampaign(r.Context(), user.TeamID, input.CampaignID) {
		writeError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	item, err := scanFlow(app.db.QueryRow(
		r.Context(),
		`INSERT INTO flows (campaign_id, name, flow_type, position, collect_clicks, status, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, campaign_id, name, flow_type, position, collect_clicks, status, notes`,
		input.CampaignID,
		strings.TrimSpace(input.Name),
		input.FlowType,
		input.Position,
		collectClicks,
		input.Status,
		nullableTrim(input.Notes),
	))
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) updateFlow(w http.ResponseWriter, r *http.Request, user User) {
	flowID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || flowID <= 0 {
		writeError(w, http.StatusBadRequest, "Invalid flow id")
		return
	}

	var input struct {
		Name          *string `json:"name"`
		FlowType      *string `json:"flow_type"`
		Position      *int    `json:"position"`
		CollectClicks *bool   `json:"collect_clicks"`
		Status        *string `json:"status"`
		Notes         *string `json:"notes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !app.ownsFlow(r.Context(), user.TeamID, flowID) {
		writeError(w, http.StatusNotFound, "Flow not found")
		return
	}

	var name *string
	if input.Name != nil {
		trimmed := strings.TrimSpace(*input.Name)
		if trimmed == "" {
			writeError(w, http.StatusUnprocessableEntity, "Flow name is required")
			return
		}
		name = &trimmed
	}
	if input.FlowType != nil && *input.FlowType != "regular" && *input.FlowType != "default" && *input.FlowType != "forced" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid flow type")
		return
	}
	if input.Status != nil && *input.Status != "active" && *input.Status != "paused" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid flow status")
		return
	}

	var notes any
	updateNotes := input.Notes != nil
	if updateNotes {
		notes = nullableTrim(*input.Notes)
	}
	item, err := scanFlow(app.db.QueryRow(
		r.Context(),
		`UPDATE flows
		 SET name = COALESCE($2::text, name),
		     flow_type = COALESCE($3::text, flow_type),
		     position = COALESCE($4::integer, position),
		     collect_clicks = COALESCE($5::boolean, collect_clicks),
		     status = COALESCE($6::text, status),
		     notes = CASE WHEN $8::boolean THEN $7::text ELSE notes END,
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, campaign_id, name, flow_type, position, collect_clicks, status, notes`,
		flowID,
		name,
		input.FlowType,
		input.Position,
		input.CollectClicks,
		input.Status,
		notes,
		updateNotes,
	))
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (app *App) flowFilters(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT ff.id, ff.flow_id, ff.type, ff.operator, ff.values, ff.position, ff.status
		 FROM flow_filters ff
		 JOIN flows f ON f.id = ff.flow_id
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE c.team_id = $1
		 ORDER BY ff.position, ff.id`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load flow filters")
		return
	}
	defer rows.Close()

	items := []FlowFilter{}
	for rows.Next() {
		var item FlowFilter
		var raw []byte
		if err := rows.Scan(&item.ID, &item.FlowID, &item.Type, &item.Operator, &raw, &item.Position, &item.Status); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read flow filter")
			return
		}
		_ = json.Unmarshal(raw, &item.Values)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createFlowFilter(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		FlowID   int64    `json:"flow_id"`
		Type     string   `json:"type"`
		Operator string   `json:"operator"`
		Values   []string `json:"values"`
		Position int      `json:"position"`
		Status   string   `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Operator == "" {
		input.Operator = "in"
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if !app.ownsFlow(r.Context(), user.TeamID, input.FlowID) {
		writeError(w, http.StatusNotFound, "Flow not found")
		return
	}

	values, _ := json.Marshal(input.Values)
	var item FlowFilter
	var raw []byte
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO flow_filters (flow_id, type, operator, values, position, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, flow_id, type, operator, values, position, status`,
		input.FlowID, input.Type, input.Operator, values, input.Position, input.Status,
	).Scan(&item.ID, &item.FlowID, &item.Type, &item.Operator, &raw, &item.Position, &item.Status)
	if err != nil {
		writeDBError(w, err)
		return
	}
	_ = json.Unmarshal(raw, &item.Values)
	writeJSON(w, http.StatusCreated, item)
}

func (app *App) streams(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT s.id, s.flow_id, s.name, s.position, s.status
		 FROM streams s
		 JOIN flows f ON f.id = s.flow_id
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE c.team_id = $1
		 ORDER BY s.position, s.id`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load streams")
		return
	}
	defer rows.Close()

	items := []Stream{}
	for rows.Next() {
		var item Stream
		if err := rows.Scan(&item.ID, &item.FlowID, &item.Name, &item.Position, &item.Status); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read stream")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createStream(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		FlowID   int64  `json:"flow_id"`
		Name     string `json:"name"`
		Position int    `json:"position"`
		Status   string `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if !app.ownsFlow(r.Context(), user.TeamID, input.FlowID) {
		writeError(w, http.StatusNotFound, "Flow not found")
		return
	}

	var item Stream
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO streams (flow_id, name, position, status)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, flow_id, name, position, status`,
		input.FlowID, input.Name, input.Position, input.Status,
	).Scan(&item.ID, &item.FlowID, &item.Name, &item.Position, &item.Status)
	if err != nil {
		writeDBError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) streamDestinations(w http.ResponseWriter, r *http.Request, user User) {
	rows, err := app.db.Query(
		r.Context(),
		`SELECT sd.id, sd.stream_id, sd.destination_type, sd.destination_id, sd.url, sd.weight, sd.status
		 FROM stream_destinations sd
		 JOIN streams s ON s.id = sd.stream_id
		 JOIN flows f ON f.id = s.flow_id
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE c.team_id = $1
		 ORDER BY sd.id`,
		user.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load destinations")
		return
	}
	defer rows.Close()

	items := []StreamDestination{}
	for rows.Next() {
		var item StreamDestination
		var destinationID pgtype.Int8
		var rawURL pgtype.Text
		if err := rows.Scan(&item.ID, &item.StreamID, &item.DestinationType, &destinationID, &rawURL, &item.Weight, &item.Status); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read destination")
			return
		}
		if destinationID.Valid {
			item.DestinationID = &destinationID.Int64
		}
		if rawURL.Valid {
			item.URL = &rawURL.String
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (app *App) createStreamDestination(w http.ResponseWriter, r *http.Request, user User) {
	var input struct {
		StreamID        int64   `json:"stream_id"`
		DestinationType string  `json:"destination_type"`
		DestinationID   *int64  `json:"destination_id"`
		URL             *string `json:"url"`
		Weight          int     `json:"weight"`
		Status          string  `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Weight == 0 {
		input.Weight = 100
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if input.DestinationType == "url" && (input.URL == nil || *input.URL == "") {
		writeError(w, http.StatusUnprocessableEntity, "URL destination requires url")
		return
	}
	if !app.ownsStream(r.Context(), user.TeamID, input.StreamID) {
		writeError(w, http.StatusNotFound, "Stream not found")
		return
	}

	var item StreamDestination
	var destinationID pgtype.Int8
	var rawURL pgtype.Text
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO stream_destinations (stream_id, destination_type, destination_id, url, weight, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, stream_id, destination_type, destination_id, url, weight, status`,
		input.StreamID, input.DestinationType, input.DestinationID, input.URL, input.Weight, input.Status,
	).Scan(&item.ID, &item.StreamID, &item.DestinationType, &destinationID, &rawURL, &item.Weight, &item.Status)
	if err != nil {
		writeDBError(w, err)
		return
	}
	if destinationID.Valid {
		item.DestinationID = &destinationID.Int64
	}
	if rawURL.Valid {
		item.URL = &rawURL.String
	}

	writeJSON(w, http.StatusCreated, item)
}

func (app *App) updateStreamDestination(w http.ResponseWriter, r *http.Request, user User) {
	destinationID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || destinationID <= 0 {
		writeError(w, http.StatusBadRequest, "Invalid destination id")
		return
	}

	var input struct {
		DestinationType string  `json:"destination_type"`
		TargetID        *int64  `json:"destination_id"`
		URL             *string `json:"url"`
		Weight          int     `json:"weight"`
		Status          string  `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.DestinationType != "offer" && input.DestinationType != "landing" && input.DestinationType != "url" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid destination type")
		return
	}
	if input.DestinationType == "url" && (input.URL == nil || strings.TrimSpace(*input.URL) == "") {
		writeError(w, http.StatusUnprocessableEntity, "URL destination requires url")
		return
	}
	if input.Weight == 0 {
		input.Weight = 100
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if input.Status != "active" && input.Status != "paused" {
		writeError(w, http.StatusUnprocessableEntity, "Invalid destination status")
		return
	}

	var item StreamDestination
	var targetID pgtype.Int8
	var rawURL pgtype.Text
	err = app.db.QueryRow(
		r.Context(),
		`UPDATE stream_destinations sd
		 SET destination_type = $3,
		     destination_id = $4,
		     url = $5,
		     weight = $6,
		     status = $7,
		     updated_at = now()
		 FROM streams s
		 JOIN flows f ON f.id = s.flow_id
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE sd.id = $1
		   AND sd.stream_id = s.id
		   AND c.team_id = $2
		 RETURNING sd.id, sd.stream_id, sd.destination_type, sd.destination_id, sd.url, sd.weight, sd.status`,
		destinationID,
		user.TeamID,
		input.DestinationType,
		input.TargetID,
		input.URL,
		input.Weight,
		input.Status,
	).Scan(&item.ID, &item.StreamID, &item.DestinationType, &targetID, &rawURL, &item.Weight, &item.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "Destination not found")
			return
		}
		writeDBError(w, err)
		return
	}
	if targetID.Valid {
		item.DestinationID = &targetID.Int64
	}
	if rawURL.Valid {
		item.URL = &rawURL.String
	}
	writeJSON(w, http.StatusOK, item)
}

func (app *App) reportClicks(w http.ResponseWriter, r *http.Request, user User) {
	limit := 100
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}

	where := "1 = 1"
	switch r.URL.Query().Get("date") {
	case "today":
		where = "event_time >= today()"
	case "yesterday":
		where = "event_time >= yesterday() AND event_time < today()"
	}

	query := fmt.Sprintf(
		`SELECT
		   formatDateTime(event_time, '%%Y-%%m-%%d %%H:%%i:%%S') AS date_time,
		   event_id, click_id, subid, campaign_id, campaign_slug, flow_id, stream_id,
		   destination_id, ip, user_agent, referrer, destination_url, source, country,
		   region, city, os, os_version, browser, browser_version, connection_type,
		   device_type, device_model, bot, unique_campaign, unique_flow, unique_global,
		   event_type, site, x_requested_with, search_engine, keyword, visitor_code,
		   ad_campaign_id, external_id, creative_id, cost, domain, language,
		   ip_1_2_mask, ip_1_2_3_mask, empty_referrer, using_proxy, landing_clicked,
		   sub_id_1, sub_id_2, sub_id_3, sub_id_4, sub_id_5, sub_id_6, sub_id_7,
		   sub_id_8, sub_id_9, sub_id_10, sub_id_11, sub_id_12, sub_id_13,
		   sub_id_14, sub_id_15, sub_id_16, sub_id_17, sub_id_18, sub_id_19,
		   sub_id_20, sub_id_21, sub_id_22, sub_id_23, sub_id_24, sub_id_25,
		   sub_id_26, sub_id_27, sub_id_28, sub_id_29, sub_id_30
		 FROM %s.clicks
		 WHERE %s
		 ORDER BY event_time DESC
		 LIMIT %d
		 FORMAT JSONEachRow`,
		app.clickhouseDatabase,
		where,
		limit,
	)

	rows, err := app.queryClickHouseRows(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load click report")
		return
	}

	campaigns, flows, destinations := app.reportLookups(r.Context(), user.TeamID)
	for _, row := range rows {
		campaignID := int64FromAny(row["campaign_id"])
		if campaign, ok := campaigns[campaignID]; ok {
			row["campaign"] = campaign["name"]
			row["campaign_group"] = campaign["group_name"]
			row["source"] = firstNonEmpty(stringFromAny(row["source"]), campaign["source_name"])
		}

		flowID := int64FromAny(row["flow_id"])
		if flow, ok := flows[flowID]; ok {
			row["flow"] = flow
		}

		destinationID := int64FromAny(row["destination_id"])
		if destination, ok := destinations[destinationID]; ok {
			row["destination"] = destination["destination"]
			row["landing_page"] = destination["landing_page"]
			row["landing_page_group"] = destination["landing_page_group"]
			row["lp_id"] = destination["lp_id"]
			row["offer"] = destination["offer"]
			row["offer_group"] = destination["offer_group"]
			row["offer_id"] = destination["offer_id"]
			row["affiliate_network"] = destination["affiliate_network"]
		}

		row["event_id"] = firstNonEmpty(stringFromAny(row["event_id"]), stringFromAny(row["click_id"]))
		row["country"] = firstNonEmpty(stringFromAny(row["country"]), normalizeCountryCode(countryFromAcceptLanguage(stringFromAny(row["language"]))))
		if stringFromAny(row["city"]) == "" && isLocalIP(stringFromAny(row["ip"])) {
			row["city"] = "Local"
		}
		row["device_model"] = firstNonEmpty(stringFromAny(row["device_model"]), detectDeviceModel(stringFromAny(row["user_agent"])))
		row["country_flag"] = normalizeCountryCode(stringFromAny(row["country"]))
		row["os_logo"] = osLogo(stringFromAny(row["os"]))
		row["browser_logo"] = browserLogo(stringFromAny(row["browser"]))
		row["bot"] = boolFromAny(row["bot"])
		row["unique_clicks_campaign"] = boolFromAny(row["unique_campaign"])
		row["unique_clicks_flow"] = boolFromAny(row["unique_flow"])
		row["unique_clicks_global"] = boolFromAny(row["unique_global"])
		row["empty_referrer"] = boolFromAny(row["empty_referrer"])
		row["using_proxy"] = boolFromAny(row["using_proxy"])
		row["landing_clicked"] = boolFromAny(row["landing_clicked"])
		applyDateParts(row)
	}

	writeJSON(w, http.StatusOK, rows)
}

func (app *App) dashboard(w http.ResponseWriter, r *http.Request, user User) {
	teamFilter, hasCampaigns, err := app.clickHouseTeamFilter(r.Context(), user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load dashboard")
		return
	}
	if !hasCampaigns {
		writeJSON(w, http.StatusOK, emptyDashboardPayload())
		return
	}

	date := r.URL.Query().Get("date")
	clickDateWhere := clickHouseDateWhere("event_time", date)
	conversionDateWhere := clickHouseDateWhere("event_time", date)
	clickWhere := fmt.Sprintf("%s AND %s", clickDateWhere, teamFilter)
	payload := emptyDashboardPayload()

	clickRows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load dashboard")
		return
	}
	if len(clickRows) > 0 {
		payload.Metrics.Clicks = int64FromAny(clickRows[0]["clicks"])
		payload.Metrics.UniqueCampaign = int64FromAny(clickRows[0]["unique_campaign"])
		payload.Metrics.Cost = float64FromAny(clickRows[0]["cost"])
	}

	conversionRows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT countIf(status = 'accepted') AS conversions,
			        sumIf(payout, status = 'accepted') AS revenue
			 FROM %s.conversions
			 WHERE %s
			   AND click_id IN (SELECT click_id FROM %s.clicks WHERE %s)
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			conversionDateWhere,
			app.clickhouseDatabase,
			teamFilter,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load dashboard")
		return
	}
	if len(conversionRows) > 0 {
		payload.Metrics.Conversions = int64FromAny(conversionRows[0]["conversions"])
		payload.Metrics.RevenueConfirmed = float64FromAny(conversionRows[0]["revenue"])
	}
	payload.Metrics.ProfitLossConfirmed = payload.Metrics.RevenueConfirmed - payload.Metrics.Cost
	if payload.Metrics.Cost > 0 {
		payload.Metrics.ROIConfirmed = (payload.Metrics.ProfitLossConfirmed / payload.Metrics.Cost) * 100
	}

	hourRows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT toHour(event_time) AS hour,
			        count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 GROUP BY hour
			 ORDER BY hour
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load dashboard")
		return
	}
	for _, row := range hourRows {
		hour := int(int64FromAny(row["hour"]))
		if hour < 0 || hour > 23 {
			continue
		}
		payload.Hourly[hour].Clicks = int64FromAny(row["clicks"])
		payload.Hourly[hour].UniqueCampaign = int64FromAny(row["unique_campaign"])
		payload.Hourly[hour].Cost = float64FromAny(row["cost"])
	}

	hourConversionRows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT toHour(event_time) AS hour,
			        countIf(status = 'accepted') AS conversions,
			        sumIf(payout, status = 'accepted') AS revenue
			 FROM %s.conversions
			 WHERE %s
			   AND click_id IN (SELECT click_id FROM %s.clicks WHERE %s)
			 GROUP BY hour
			 ORDER BY hour
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			conversionDateWhere,
			app.clickhouseDatabase,
			teamFilter,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load dashboard")
		return
	}
	for _, row := range hourConversionRows {
		hour := int(int64FromAny(row["hour"]))
		if hour < 0 || hour > 23 {
			continue
		}
		payload.Hourly[hour].Conversions = int64FromAny(row["conversions"])
		payload.Hourly[hour].Revenue = float64FromAny(row["revenue"])
		payload.Hourly[hour].ProfitLoss = payload.Hourly[hour].Revenue - payload.Hourly[hour].Cost
		if payload.Hourly[hour].Cost > 0 {
			payload.Hourly[hour].ROI = (payload.Hourly[hour].ProfitLoss / payload.Hourly[hour].Cost) * 100
		}
	}

	campaigns, _, destinations := app.reportLookups(r.Context(), user.TeamID)
	payload.Tables = []DashboardTable{
		app.dashboardCampaignTable(r.Context(), clickWhere, conversionDateWhere, teamFilter, campaigns),
		app.dashboardDestinationTable(r.Context(), clickWhere, conversionDateWhere, teamFilter, destinations, "landing"),
		app.dashboardDestinationTable(r.Context(), clickWhere, conversionDateWhere, teamFilter, destinations, "offer"),
		app.dashboardSourceTable(r.Context(), clickWhere),
	}

	writeJSON(w, http.StatusOK, payload)
}

func (app *App) campaignStats(w http.ResponseWriter, r *http.Request, user User) {
	teamFilter, hasCampaigns, err := app.clickHouseTeamFilter(r.Context(), user.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load campaign stats")
		return
	}
	if !hasCampaigns {
		writeJSON(w, http.StatusOK, []CampaignStats{})
		return
	}

	date := r.URL.Query().Get("date")
	clickDateWhere := clickHouseDateWhere("event_time", date)
	conversionDateWhere := clickHouseDateWhere("event_time", date)
	clickWhere := fmt.Sprintf("%s AND %s", clickDateWhere, teamFilter)

	rows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT campaign_id AS campaign_id,
			        count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 GROUP BY campaign_id
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load campaign stats")
		return
	}

	statsByCampaign := map[int64]*CampaignStats{}
	for _, row := range rows {
		campaignID := int64FromAny(row["campaign_id"])
		if campaignID == 0 {
			continue
		}
		statsByCampaign[campaignID] = &CampaignStats{
			CampaignID:     campaignID,
			Clicks:         int64FromAny(row["clicks"]),
			UniqueCampaign: int64FromAny(row["unique_campaign"]),
			Cost:           float64FromAny(row["cost"]),
		}
	}

	conversionRows, err := app.queryClickHouseRows(
		r.Context(),
		fmt.Sprintf(
			`SELECT c.campaign_id AS campaign_id,
			        countIf(v.status = 'accepted') AS conversions,
			        sumIf(v.payout, v.status = 'accepted') AS revenue
			 FROM %s.conversions v
			 INNER JOIN (
			   SELECT click_id, campaign_id
			   FROM %s.clicks
			   WHERE %s
			 ) c ON v.click_id = c.click_id
			 WHERE %s
			 GROUP BY campaign_id
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			app.clickhouseDatabase,
			teamFilter,
			conversionDateWhere,
		),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load campaign stats")
		return
	}

	for _, row := range conversionRows {
		campaignID := int64FromAny(row["campaign_id"])
		if campaignID == 0 {
			continue
		}
		stats := statsByCampaign[campaignID]
		if stats == nil {
			stats = &CampaignStats{CampaignID: campaignID}
			statsByCampaign[campaignID] = stats
		}
		stats.Conversions = int64FromAny(row["conversions"])
		stats.Revenue = float64FromAny(row["revenue"])
	}

	stats := make([]CampaignStats, 0, len(statsByCampaign))
	for _, item := range statsByCampaign {
		stats = append(stats, *item)
	}
	writeJSON(w, http.StatusOK, stats)
}

type DashboardPayload struct {
	Metrics DashboardMetrics `json:"metrics"`
	Hourly  []DashboardHour  `json:"hourly"`
	Tables  []DashboardTable `json:"tables"`
}

type CampaignStats struct {
	CampaignID     int64   `json:"campaign_id"`
	Clicks         int64   `json:"clicks"`
	UniqueCampaign int64   `json:"unique_campaign"`
	Conversions    int64   `json:"conversions"`
	Cost           float64 `json:"cost"`
	Revenue        float64 `json:"revenue"`
}

type DashboardMetrics struct {
	Clicks              int64   `json:"clicks"`
	UniqueCampaign      int64   `json:"unique_campaign"`
	Conversions         int64   `json:"conversions"`
	Cost                float64 `json:"cost"`
	RevenueConfirmed    float64 `json:"revenue_confirmed"`
	ProfitLossConfirmed float64 `json:"profit_loss_confirmed"`
	ROIConfirmed        float64 `json:"roi_confirmed"`
}

type DashboardHour struct {
	Hour           string  `json:"hour"`
	Clicks         int64   `json:"clicks"`
	UniqueCampaign int64   `json:"unique_campaign"`
	Conversions    int64   `json:"conversions"`
	Cost           float64 `json:"cost"`
	Revenue        float64 `json:"revenue"`
	ProfitLoss     float64 `json:"profit_loss"`
	ROI            float64 `json:"roi"`
}

type DashboardTable struct {
	Key   string              `json:"key"`
	Title string              `json:"title"`
	Rows  []DashboardTableRow `json:"rows"`
	Total DashboardTableRow   `json:"total"`
}

type DashboardTableRow struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Clicks         int64   `json:"clicks"`
	UniqueCampaign int64   `json:"unique_campaign"`
	Conversions    int64   `json:"conversions"`
	Cost           float64 `json:"cost"`
}

func emptyDashboardPayload() DashboardPayload {
	hours := make([]DashboardHour, 24)
	for hour := range hours {
		hours[hour].Hour = fmt.Sprintf("%02d:00", hour)
	}
	return DashboardPayload{
		Hourly: hours,
		Tables: []DashboardTable{
			{Key: "campaign", Title: "Campaign"},
			{Key: "landing", Title: "Landing page"},
			{Key: "offer", Title: "Offer"},
			{Key: "source", Title: "Source"},
		},
	}
}

func (app *App) dashboardCampaignTable(ctx context.Context, clickWhere, conversionDateWhere, teamFilter string, campaigns map[int64]map[string]string) DashboardTable {
	table := DashboardTable{Key: "campaign", Title: "Campaign"}
	rows, err := app.queryClickHouseRows(
		ctx,
		fmt.Sprintf(
			`SELECT campaign_id AS id,
			        count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 GROUP BY id
			 ORDER BY clicks DESC
			 LIMIT 5
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		return table
	}
	conversions := app.dashboardConversionsBy(ctx, "campaign_id", conversionDateWhere, teamFilter)
	for _, row := range rows {
		id := int64FromAny(row["id"])
		name := fmt.Sprintf("Campaign #%d", id)
		if campaign, ok := campaigns[id]; ok && campaign["name"] != "" {
			name = campaign["name"]
		}
		item := DashboardTableRow{
			ID:             strconv.FormatInt(id, 10),
			Name:           name,
			Clicks:         int64FromAny(row["clicks"]),
			UniqueCampaign: int64FromAny(row["unique_campaign"]),
			Conversions:    conversions[id],
			Cost:           float64FromAny(row["cost"]),
		}
		table.Rows = append(table.Rows, item)
		addDashboardTotal(&table.Total, item)
	}
	return table
}

func (app *App) dashboardDestinationTable(ctx context.Context, clickWhere, conversionDateWhere, teamFilter string, destinations map[int64]map[string]any, destinationType string) DashboardTable {
	title := "Landing page"
	if destinationType == "offer" {
		title = "Offer"
	}
	table := DashboardTable{Key: destinationType, Title: title}
	rows, err := app.queryClickHouseRows(
		ctx,
		fmt.Sprintf(
			`SELECT destination_id AS id,
			        count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 GROUP BY id
			 ORDER BY clicks DESC
			 LIMIT 50
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		return table
	}
	conversions := app.dashboardConversionsBy(ctx, "destination_id", conversionDateWhere, teamFilter)
	for _, row := range rows {
		id := int64FromAny(row["id"])
		destination, ok := destinations[id]
		if !ok {
			continue
		}
		name := ""
		if destinationType == "landing" {
			name = stringFromAny(destination["landing_page"])
		} else {
			name = stringFromAny(destination["offer"])
		}
		if name == "" {
			continue
		}
		item := DashboardTableRow{
			ID:             strconv.FormatInt(id, 10),
			Name:           name,
			Clicks:         int64FromAny(row["clicks"]),
			UniqueCampaign: int64FromAny(row["unique_campaign"]),
			Conversions:    conversions[id],
			Cost:           float64FromAny(row["cost"]),
		}
		table.Rows = append(table.Rows, item)
		addDashboardTotal(&table.Total, item)
		if len(table.Rows) == 5 {
			break
		}
	}
	return table
}

func (app *App) dashboardSourceTable(ctx context.Context, clickWhere string) DashboardTable {
	table := DashboardTable{Key: "source", Title: "Source"}
	rows, err := app.queryClickHouseRows(
		ctx,
		fmt.Sprintf(
			`SELECT source AS id,
			        count() AS clicks,
			        sum(unique_campaign) AS unique_campaign,
			        sum(cost) AS cost
			 FROM %s.clicks
			 WHERE %s
			 GROUP BY id
			 ORDER BY clicks DESC
			 LIMIT 5
			 FORMAT JSONEachRow`,
			app.clickhouseDatabase,
			clickWhere,
		),
	)
	if err != nil {
		return table
	}
	for _, row := range rows {
		name := firstNonEmpty(stringFromAny(row["id"]), "Direct")
		item := DashboardTableRow{
			ID:             name,
			Name:           name,
			Clicks:         int64FromAny(row["clicks"]),
			UniqueCampaign: int64FromAny(row["unique_campaign"]),
			Cost:           float64FromAny(row["cost"]),
		}
		table.Rows = append(table.Rows, item)
		addDashboardTotal(&table.Total, item)
	}
	return table
}

func (app *App) dashboardConversionsBy(ctx context.Context, groupColumn, conversionDateWhere, teamFilter string) map[int64]int64 {
	result := map[int64]int64{}
	if groupColumn != "campaign_id" && groupColumn != "destination_id" {
		return result
	}
	rows, err := app.queryClickHouseRows(
		ctx,
		fmt.Sprintf(
			`SELECT c.%s AS id,
			        countIf(v.status = 'accepted') AS conversions
			 FROM %s.conversions v
			 INNER JOIN (
			   SELECT click_id, %s
			   FROM %s.clicks
			   WHERE %s
			 ) c ON v.click_id = c.click_id
			 WHERE %s
			 GROUP BY id
			 FORMAT JSONEachRow`,
			groupColumn,
			app.clickhouseDatabase,
			groupColumn,
			app.clickhouseDatabase,
			teamFilter,
			conversionDateWhere,
		),
	)
	if err != nil {
		return result
	}
	for _, row := range rows {
		result[int64FromAny(row["id"])] = int64FromAny(row["conversions"])
	}
	return result
}

func addDashboardTotal(total *DashboardTableRow, row DashboardTableRow) {
	total.Clicks += row.Clicks
	total.UniqueCampaign += row.UniqueCampaign
	total.Conversions += row.Conversions
	total.Cost += row.Cost
}

func (app *App) clickHouseTeamFilter(ctx context.Context, teamID int64) (string, bool, error) {
	rows, err := app.db.Query(ctx, "SELECT id FROM campaigns WHERE team_id = $1", teamID)
	if err != nil {
		return "", false, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return "", false, err
		}
		ids = append(ids, strconv.FormatInt(id, 10))
	}
	if err := rows.Err(); err != nil {
		return "", false, err
	}
	if len(ids) == 0 {
		return "", false, nil
	}
	return "campaign_id IN (" + strings.Join(ids, ",") + ")", true, nil
}

func clickHouseDateWhere(column, date string) string {
	switch date {
	case "today":
		return column + " >= today()"
	case "yesterday":
		return column + " >= yesterday() AND " + column + " < today()"
	case "last7":
		return column + " >= now() - INTERVAL 7 DAY"
	default:
		return "1 = 1"
	}
}

func (app *App) reportLookups(ctx context.Context, teamID int64) (map[int64]map[string]string, map[int64]string, map[int64]map[string]any) {
	campaigns := map[int64]map[string]string{}
	campaignRows, err := app.db.Query(ctx, "SELECT id, name, group_name, source_name FROM campaigns WHERE team_id = $1", teamID)
	if err == nil {
		defer campaignRows.Close()
		for campaignRows.Next() {
			var id int64
			var name string
			var groupName pgtype.Text
			var sourceName pgtype.Text
			if campaignRows.Scan(&id, &name, &groupName, &sourceName) == nil {
				campaigns[id] = map[string]string{
					"name":        name,
					"group_name":  textValue(groupName),
					"source_name": textValue(sourceName),
				}
			}
		}
	}

	flows := map[int64]string{}
	flowRows, err := app.db.Query(
		ctx,
		`SELECT f.id, f.name
		 FROM flows f
		 JOIN campaigns c ON c.id = f.campaign_id
		 WHERE c.team_id = $1`,
		teamID,
	)
	if err == nil {
		defer flowRows.Close()
		for flowRows.Next() {
			var id int64
			var name string
			if flowRows.Scan(&id, &name) == nil {
				flows[id] = name
			}
		}
	}

	destinations := map[int64]map[string]any{}
	destinationRows, err := app.db.Query(
		ctx,
		`SELECT sd.id, sd.destination_type, sd.destination_id, sd.url,
		        o.name, o.group_name, o.affiliate_network,
		        l.name, l.group_name
		 FROM stream_destinations sd
		 JOIN streams s ON s.id = sd.stream_id
		 JOIN flows f ON f.id = s.flow_id
		 JOIN campaigns c ON c.id = f.campaign_id
		 LEFT JOIN offers o ON o.id = sd.destination_id AND sd.destination_type = 'offer'
		 LEFT JOIN landings l ON l.id = sd.destination_id AND sd.destination_type = 'landing'
		 WHERE c.team_id = $1`,
		teamID,
	)
	if err == nil {
		defer destinationRows.Close()
		for destinationRows.Next() {
			var id int64
			var destinationType string
			var destinationID pgtype.Int8
			var rawURL pgtype.Text
			var offerName pgtype.Text
			var offerGroup pgtype.Text
			var affiliateNetwork pgtype.Text
			var landingName pgtype.Text
			var landingGroup pgtype.Text
			if destinationRows.Scan(&id, &destinationType, &destinationID, &rawURL, &offerName, &offerGroup, &affiliateNetwork, &landingName, &landingGroup) != nil {
				continue
			}
			item := map[string]any{"destination": destinationType}
			switch destinationType {
			case "offer":
				item["offer"] = textValue(offerName)
				item["offer_group"] = textValue(offerGroup)
				item["affiliate_network"] = textValue(affiliateNetwork)
				if destinationID.Valid {
					item["offer_id"] = destinationID.Int64
				}
			case "landing":
				item["landing_page"] = textValue(landingName)
				item["landing_page_group"] = textValue(landingGroup)
				if destinationID.Valid {
					item["lp_id"] = destinationID.Int64
				}
			case "url":
				item["destination"] = firstNonEmpty(textValue(rawURL), "url")
			}
			destinations[id] = item
		}
	}

	return campaigns, flows, destinations
}

func (app *App) compileCampaign(w http.ResponseWriter, r *http.Request, user User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	config, err := app.buildCampaignConfig(r.Context(), user.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}

	raw, err := json.Marshal(config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not encode campaign")
		return
	}

	if err := app.storeCampaignConfig(r.Context(), config, raw); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not compile campaign")
		return
	}

	writeJSON(w, http.StatusOK, config)
}

func (app *App) buildCampaignConfig(ctx context.Context, teamID, campaignID int64) (CampaignConfig, error) {
	var config CampaignConfig
	err := app.db.QueryRow(
		ctx,
		"SELECT id, name, slug, alias, status FROM campaigns WHERE id = $1 AND team_id = $2",
		campaignID,
		teamID,
	).Scan(&config.ID, &config.Name, &config.Slug, &config.Alias, &config.Status)
	if err != nil {
		return CampaignConfig{}, err
	}

	flowRows, err := app.db.Query(ctx, "SELECT id, name FROM flows WHERE campaign_id = $1 AND status = 'active' ORDER BY position, id", campaignID)
	if err != nil {
		return CampaignConfig{}, err
	}
	defer flowRows.Close()

	for flowRows.Next() {
		flow := FlowConfig{}
		if err := flowRows.Scan(&flow.ID, &flow.Name); err != nil {
			return CampaignConfig{}, err
		}

		filters, err := app.configFilters(ctx, flow.ID)
		if err != nil {
			return CampaignConfig{}, err
		}
		streams, err := app.configStreams(ctx, teamID, flow.ID)
		if err != nil {
			return CampaignConfig{}, err
		}

		flow.Filters = filters
		flow.Streams = streams
		config.Flows = append(config.Flows, flow)
	}

	return config, nil
}

func (app *App) configFilters(ctx context.Context, flowID int64) ([]FilterConfig, error) {
	rows, err := app.db.Query(ctx, "SELECT type, operator, values FROM flow_filters WHERE flow_id = $1 AND status = 'active' ORDER BY position, id", flowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []FilterConfig{}
	for rows.Next() {
		var item FilterConfig
		var raw []byte
		if err := rows.Scan(&item.Type, &item.Operator, &raw); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(raw, &item.Values)
		items = append(items, item)
	}
	return items, nil
}

func (app *App) configStreams(ctx context.Context, teamID, flowID int64) ([]StreamConfig, error) {
	rows, err := app.db.Query(ctx, "SELECT id, name FROM streams WHERE flow_id = $1 AND status = 'active' ORDER BY position, id", flowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []StreamConfig{}
	for rows.Next() {
		var item StreamConfig
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		destinations, err := app.configDestinations(ctx, teamID, item.ID)
		if err != nil {
			return nil, err
		}
		item.Destinations = destinations
		items = append(items, item)
	}
	return items, nil
}

func (app *App) configDestinations(ctx context.Context, teamID, streamID int64) ([]DestinationConfig, error) {
	rows, err := app.db.Query(ctx, "SELECT id, destination_type, destination_id, url, weight FROM stream_destinations WHERE stream_id = $1 AND status = 'active' ORDER BY id", streamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []DestinationConfig{}
	for rows.Next() {
		var item DestinationConfig
		var destinationID pgtype.Int8
		var rawURL pgtype.Text
		if err := rows.Scan(&item.ID, &item.Type, &destinationID, &rawURL, &item.Weight); err != nil {
			return nil, err
		}

		switch item.Type {
		case "offer":
			if destinationID.Valid {
				item.URL = app.lookupURL(ctx, "offers", teamID, destinationID.Int64)
			}
		case "landing":
			if destinationID.Valid {
				item.URL = app.lookupURL(ctx, "landings", teamID, destinationID.Int64)
			}
		case "url":
			if rawURL.Valid {
				item.URL = rawURL.String
			}
		}

		if item.URL != "" {
			items = append(items, item)
		}
	}
	return items, nil
}

func (app *App) lookupURL(ctx context.Context, table string, teamID, id int64) string {
	var destinationURL string
	query := fmt.Sprintf("SELECT url FROM %s WHERE id = $1 AND team_id = $2 AND status = 'active'", table)
	_ = app.db.QueryRow(ctx, query, id, teamID).Scan(&destinationURL)
	return destinationURL
}

func (app *App) redirect(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireKnownDomain(w, r); !ok {
		return
	}
	app.redirectSlug(w, r, r.PathValue("slug"))
}

func (app *App) redirectSlug(w http.ResponseWriter, r *http.Request, slug string) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	raw, err := app.redis.Get(ctx, app.redisCampaignPrefix+slug).Result()
	if err != nil {
		raw, err = app.compileCampaignBySlug(ctx, slug)
		if err != nil {
			writeError(w, http.StatusNotFound, "Campaign not found")
			return
		}
	}

	var campaign CampaignConfig
	if err := json.Unmarshal([]byte(raw), &campaign); err != nil {
		writeError(w, http.StatusInternalServerError, "Bad campaign config")
		return
	}
	if campaign.Status != "active" {
		writeError(w, http.StatusNotFound, "Campaign inactive")
		return
	}

	flow, stream, destination, err := selectDestination(campaign, r)
	if err != nil {
		writeError(w, http.StatusNotFound, "No destination")
		return
	}

	clickID := ulid.MustNew(ulid.Timestamp(time.Now()), rand.Reader).String()
	redirectURL, err := appendClickParams(destination.URL, clickID, campaign.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Bad destination URL")
		return
	}

	go app.trackClick(r, campaign, flow, stream, destination, clickID, redirectURL)
	if destination.Type == "landing" && app.serveLandingURL(w, r, redirectURL) {
		return
	}
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

func (app *App) compileCampaignBySlug(ctx context.Context, slug string) (string, error) {
	var campaignID int64
	var teamID int64
	err := app.db.QueryRow(
		ctx,
		`SELECT id, team_id
		 FROM campaigns
		 WHERE status = 'active' AND (slug = $1 OR alias = $1)
		 ORDER BY CASE WHEN slug = $1 THEN 0 ELSE 1 END, id
		 LIMIT 1`,
		slug,
	).Scan(&campaignID, &teamID)
	if err != nil {
		return "", err
	}

	config, err := app.buildCampaignConfig(ctx, teamID, campaignID)
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(config)
	if err != nil {
		return "", err
	}
	if err := app.storeCampaignConfig(ctx, config, raw); err != nil {
		return "", err
	}
	return string(raw), nil
}

func (app *App) storeCampaignConfig(ctx context.Context, config CampaignConfig, raw []byte) error {
	keys := []string{config.Slug}
	if config.Alias != "" && config.Alias != config.Slug {
		keys = append(keys, config.Alias)
	}
	for _, key := range keys {
		if err := app.redis.Set(ctx, app.redisCampaignPrefix+key, raw, 0).Err(); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) robots(w http.ResponseWriter, r *http.Request) {
	domain, ok := app.requireKnownDomain(w, r)
	if !ok {
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if domain != nil && domain.AllowIndexing {
		_, _ = w.Write([]byte("User-agent: *\nAllow: /\n"))
		return
	}
	_, _ = w.Write([]byte("User-agent: *\nDisallow: /\n"))
}

func (app *App) trackerFallback(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(r.URL.Path, "/")
	domain, ok := app.trackerDomainForRequest(w, r, path == "")
	if !ok {
		return
	}

	if path == "" {
		if previewObject := r.URL.Query().Get("object"); previewObject == "landings.preview" || previewObject == "offers.preview" {
			http.Redirect(w, r, "/preview?"+r.URL.RawQuery, http.StatusFound)
			return
		}
		if domain != nil && domain.IndexCampaignSlug != nil {
			app.redirectSlug(w, r, *domain.IndexCampaignSlug)
			return
		}
		writeError(w, http.StatusForbidden, "Index page not configured")
		return
	}

	if !strings.Contains(path, "/") {
		app.redirectSlug(w, r, path)
		return
	}

	writeError(w, http.StatusNotFound, "Not found")
}

func (app *App) trackerDomainForRequest(w http.ResponseWriter, r *http.Request, allowAdminRoot bool) (*Domain, bool) {
	host := requestHost(r)
	if isLocalAdminHost(host) {
		return nil, true
	}

	domain, err := app.domainByHost(r.Context(), host)
	if err == nil {
		return &domain, true
	}
	if domain, err = app.domainByHostAnyStatus(r.Context(), host); err == nil {
		return &domain, true
	}

	if allowAdminRoot {
		http.Redirect(w, r, "/login", http.StatusFound)
		return nil, false
	}

	writeError(w, http.StatusNotFound, "Domain not parked")
	return nil, false
}

func selectDestination(campaign CampaignConfig, r *http.Request) (FlowConfig, StreamConfig, DestinationConfig, error) {
	for _, flow := range campaign.Flows {
		if !matchesFilters(flow.Filters, r) {
			continue
		}
		for _, stream := range flow.Streams {
			if destination, ok := weightedDestination(stream.Destinations); ok {
				return flow, stream, destination, nil
			}
		}
	}
	return FlowConfig{}, StreamConfig{}, DestinationConfig{}, errors.New("no destination")
}

func weightedDestination(destinations []DestinationConfig) (DestinationConfig, bool) {
	total := 0
	for _, destination := range destinations {
		if destination.Weight > 0 && destination.URL != "" {
			total += destination.Weight
		}
	}
	if total <= 0 {
		return DestinationConfig{}, false
	}

	pick := mrand.Intn(total) + 1
	current := 0
	for _, destination := range destinations {
		if destination.Weight <= 0 || destination.URL == "" {
			continue
		}
		current += destination.Weight
		if pick <= current {
			return destination, true
		}
	}
	return DestinationConfig{}, false
}

func matchesFilters(filters []FilterConfig, r *http.Request) bool {
	for _, filter := range filters {
		actual := strings.ToLower(filterValue(filter.Type, r))
		values := map[string]bool{}
		for _, value := range filter.Values {
			values[strings.ToLower(value)] = true
		}

		matched := values[actual]
		if (filter.Operator == "not_in" || filter.Operator == "not_equals") && matched {
			return false
		}
		if (filter.Operator == "in" || filter.Operator == "equals" || filter.Operator == "") && !matched {
			return false
		}
	}
	return true
}

func filterValue(filterType string, r *http.Request) string {
	switch filterType {
	case "country":
		return firstNonEmpty(r.URL.Query().Get("country"), r.Header.Get("CF-IPCountry"), r.Header.Get("X-Country"))
	case "device":
		ua := strings.ToLower(r.UserAgent())
		if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") || strings.Contains(ua, "iphone") {
			return "mobile"
		}
		return "desktop"
	case "os":
		return detectOS(r.UserAgent())
	case "browser":
		return detectBrowser(r.UserAgent())
	case "ip":
		return clientIP(r)
	default:
		return r.URL.Query().Get(filterType)
	}
}

func (app *App) postback(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireKnownDomain(w, r); !ok {
		return
	}

	query := r.URL.Query()
	clickID := firstNonEmpty(query.Get("subid"), query.Get("click_id"))
	if clickID == "" {
		writeError(w, http.StatusUnprocessableEntity, "subid is required")
		return
	}

	transactionID := firstNonEmpty(query.Get("transaction_id"), query.Get("tid"))
	goal := postbackGoal(r)
	status := postbackStatus(query.Get("status"))
	currency := firstNonEmpty(query.Get("currency"), "USD")
	payout, _ := strconv.ParseFloat(firstNonEmpty(query.Get("payout"), "0"), 64)
	eventKey := clickID + "|" + goal + "|" + status
	if transactionID != "" {
		eventKey = clickID + "|" + transactionID + "|" + goal + "|" + status
	}

	rawPayload, _ := json.Marshal(map[string]any{
		"click_id":       clickID,
		"subid":          clickID,
		"transaction_id": transactionID,
		"goal":           goal,
		"payout":         payout,
		"currency":       currency,
		"status":         status,
		"query":          query,
	})

	var conversionID int64
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO conversions (click_id, transaction_id, goal, payout, currency, status, event_key, raw_payload)
		 VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8)
		 RETURNING id`,
		clickID, transactionID, goal, payout, currency, status, eventKey, rawPayload,
	).Scan(&conversionID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeJSON(w, http.StatusOK, map[string]any{"status": "duplicate", "duplicate": true})
			return
		}
		writeError(w, http.StatusInternalServerError, "Could not save conversion")
		return
	}

	app.insertClickHouse("conversions", map[string]any{
		"event_time":     time.Now().UTC().Format("2006-01-02 15:04:05"),
		"click_id":       clickID,
		"transaction_id": transactionID,
		"goal":           goal,
		"payout":         payout,
		"currency":       currency,
		"status":         status,
	})

	writeJSON(w, http.StatusOK, map[string]any{"status": status, "duplicate": false, "conversion_id": conversionID})
}

func postbackGoal(r *http.Request) string {
	path := strings.Trim(r.URL.Path, "/")
	switch path {
	case "lead":
		return "lead"
	case "ftd":
		return "ftd"
	default:
		return firstNonEmpty(r.URL.Query().Get("goal"), "sale")
	}
}

func postbackStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "rejected", "reject", "declined":
		return "rejected"
	default:
		return "accepted"
	}
}

func (app *App) trackClick(r *http.Request, campaign CampaignConfig, flow FlowConfig, stream StreamConfig, destination DestinationConfig, clickID, redirectURL string) {
	query := r.URL.Query()
	ip := clientIP(r)
	userAgent := r.UserAgent()
	referrer := r.Referer()
	country := countryFromRequest(r)
	row := map[string]any{
		"event_time":       time.Now().UTC().Format("2006-01-02 15:04:05"),
		"event_id":         clickID,
		"click_id":         clickID,
		"subid":            clickID,
		"campaign_id":      campaign.ID,
		"campaign_slug":    campaign.Slug,
		"flow_id":          flow.ID,
		"stream_id":        stream.ID,
		"destination_id":   destination.ID,
		"ip":               ip,
		"user_agent":       userAgent,
		"referrer":         referrer,
		"destination_url":  redirectURL,
		"source":           firstNonEmpty(query.Get("source"), query.Get("utm_source"), query.Get("traffic_source")),
		"country":          country,
		"region":           firstNonEmpty(query.Get("region"), query.Get("state"), r.Header.Get("X-Region"), r.Header.Get("CF-Region")),
		"city":             cityFromRequest(r, ip),
		"os":               detectOS(userAgent),
		"os_version":       query.Get("os_version"),
		"browser":          detectBrowser(userAgent),
		"browser_version":  query.Get("browser_version"),
		"connection_type":  firstNonEmpty(query.Get("connection_type"), r.Header.Get("X-Connection-Type")),
		"device_type":      detectDeviceType(userAgent),
		"device_model":     firstNonEmpty(query.Get("device_model"), query.Get("device"), query.Get("model"), r.Header.Get("X-Device-Model"), detectDeviceModel(userAgent)),
		"bot":              boolToInt(isBot(userAgent)),
		"unique_campaign":  1,
		"unique_flow":      1,
		"unique_global":    1,
		"event_type":       "click",
		"site":             firstNonEmpty(query.Get("site"), query.Get("source")),
		"x_requested_with": r.Header.Get("X-Requested-With"),
		"search_engine":    query.Get("search_engine"),
		"keyword":          firstNonEmpty(query.Get("keyword"), query.Get("kw")),
		"visitor_code":     firstNonEmpty(query.Get("visitor_code"), query.Get("visitor")),
		"ad_campaign_id":   firstNonEmpty(query.Get("ad_campaign_id"), query.Get("campaign")),
		"external_id":      firstNonEmpty(query.Get("external_id"), query.Get("external")),
		"creative_id":      firstNonEmpty(query.Get("creative_id"), query.Get("creative")),
		"cost":             floatFromQuery(query.Get("cost")),
		"domain":           requestHost(r),
		"language":         firstLanguage(r.Header.Get("Accept-Language")),
		"ip_1_2_mask":      maskedIP(ip, 2),
		"ip_1_2_3_mask":    maskedIP(ip, 3),
		"empty_referrer":   boolToInt(referrer == ""),
		"using_proxy":      boolToInt(r.Header.Get("Via") != "" || r.Header.Get("X-Forwarded-For") != ""),
		"landing_clicked":  0,
	}
	for index := 1; index <= 30; index++ {
		key := fmt.Sprintf("sub_id_%d", index)
		row[key] = firstNonEmpty(query.Get(key), query.Get(fmt.Sprintf("sub%d", index)))
	}
	app.insertClickHouse("clicks", row)
}

func (app *App) insertClickHouse(table string, row map[string]any) {
	body, _ := json.Marshal(row)
	query := fmt.Sprintf("INSERT INTO %s.%s FORMAT JSONEachRow", app.clickhouseDatabase, table)
	request, err := http.NewRequest(http.MethodPost, app.clickhouseURL+"/?query="+url.QueryEscape(query), strings.NewReader(string(body)+"\n"))
	if err != nil {
		log.Printf("clickhouse request: %v", err)
		return
	}
	request.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		log.Printf("clickhouse insert: %v", err)
		return
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("clickhouse insert returned %s", response.Status)
	}
}

func (app *App) execClickHouse(ctx context.Context, query string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, app.clickhouseURL+"/?query="+url.QueryEscape(query), nil)
	if err != nil {
		return err
	}
	client := http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("clickhouse returned %s", response.Status)
	}
	return nil
}

func (app *App) queryClickHouseRows(ctx context.Context, query string) ([]ClickReportRow, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, app.clickhouseURL+"/?query="+url.QueryEscape(query), nil)
	if err != nil {
		return nil, err
	}
	client := http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("clickhouse returned %s", response.Status)
	}

	decoder := json.NewDecoder(response.Body)
	rows := []ClickReportRow{}
	for {
		row := ClickReportRow{}
		if err := decoder.Decode(&row); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (app *App) ownsCampaign(ctx context.Context, teamID, campaignID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM campaigns WHERE id = $1 AND team_id = $2)", campaignID, teamID).Scan(&exists)
	return exists
}

func (app *App) ownsDomain(ctx context.Context, teamID, domainID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM domains WHERE id = $1 AND team_id = $2)", domainID, teamID).Scan(&exists)
	return exists
}

func (app *App) ownsTrafficSource(ctx context.Context, teamID, sourceID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM traffic_sources WHERE id = $1 AND team_id = $2)", sourceID, teamID).Scan(&exists)
	return exists
}

func (app *App) getTrafficSourceForTeam(ctx context.Context, teamID, sourceID int64) (TrafficSource, error) {
	return scanTrafficSource(app.db.QueryRow(
		ctx,
		`SELECT id, team_id, user_id, name, postback_url, parameters, notes
		 FROM traffic_sources
		 WHERE id = $1 AND team_id = $2`,
		sourceID,
		teamID,
	))
}

func (app *App) isTeamlead(ctx context.Context, teamID, userID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND team_id = $2 AND role = 'teamlead')", userID, teamID).Scan(&exists)
	return exists
}

func (app *App) ownsFlow(ctx context.Context, teamID, flowID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM flows f JOIN campaigns c ON c.id = f.campaign_id
		WHERE f.id = $1 AND c.team_id = $2
	)`, flowID, teamID).Scan(&exists)
	return exists
}

func (app *App) ownsStream(ctx context.Context, teamID, streamID int64) bool {
	var exists bool
	_ = app.db.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM streams s
		JOIN flows f ON f.id = s.flow_id
		JOIN campaigns c ON c.id = f.campaign_id
		WHERE s.id = $1 AND c.team_id = $2
	)`, streamID, teamID).Scan(&exists)
	return exists
}

func (app *App) auth(next func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "Missing bearer token")
			return
		}

		var user User
		var teamName string
		err := app.db.QueryRow(
			r.Context(),
			`SELECT u.id, u.team_id, u.name, u.email, u.role, u.avatar_url, u.two_factor_enabled, u.manager_id, t.name
			 FROM api_tokens at
			 JOIN users u ON u.id = at.user_id
			 JOIN teams t ON t.id = u.team_id
			 WHERE at.token_hash = $1 AND (at.expires_at IS NULL OR at.expires_at > now())`,
			hashToken(token),
		).Scan(&user.ID, &user.TeamID, &user.Name, &user.Email, &user.Role, avatarScanTarget(&user), &user.TwoFactorEnabled, managerIDScanTarget(&user), &teamName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid bearer token")
			return
		}
		user.Team = &Team{ID: user.TeamID, Name: teamName}
		next(w, r, user)
	}
}

func (app *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", env("CORS_ALLOW_ORIGIN", "*"))
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return false
	}
	return true
}

func writeDBError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			writeError(w, http.StatusConflict, "Already exists")
			return
		case "23514", "23502":
			writeError(w, http.StatusUnprocessableEntity, "Invalid payload")
			return
		}
	}
	writeError(w, http.StatusInternalServerError, "Database error")
}

func writeNotFoundOrDB(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}
	writeDBError(w, err)
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "Invalid id")
		return 0, false
	}
	return id, true
}

func newToken() (string, string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	return token, hashToken(token), nil
}

func newTOTPSecret() (string, error) {
	bytes := make([]byte, 20)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}

func totpAuthURL(issuer, account, secret string) string {
	label := issuer + ":" + account
	values := url.Values{}
	values.Set("secret", secret)
	values.Set("issuer", issuer)
	values.Set("algorithm", "SHA1")
	values.Set("digits", "6")
	values.Set("period", "30")
	return "otpauth://totp/" + url.PathEscape(label) + "?" + values.Encode()
}

func validTOTPCode(secret, code string, at time.Time) bool {
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != 6 {
		return false
	}
	for _, char := range code {
		if char < '0' || char > '9' {
			return false
		}
	}

	for offset := int64(-1); offset <= 1; offset++ {
		expected, ok := totpCode(secret, at.Unix()/30+offset)
		if ok && hmac.Equal([]byte(expected), []byte(code)) {
			return true
		}
	}
	return false
}

func totpCode(secret string, counter int64) (string, bool) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", false
	}

	var message [8]byte
	binary.BigEndian.PutUint64(message[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(message[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := (uint32(sum[offset])&0x7f)<<24 |
		(uint32(sum[offset+1])&0xff)<<16 |
		(uint32(sum[offset+2])&0xff)<<8 |
		(uint32(sum[offset+3]) & 0xff)
	return fmt.Sprintf("%06d", value%1_000_000), true
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func validRole(role string) bool {
	switch role {
	case "admin", "buyer", "teamlead", "finance":
		return true
	default:
		return false
	}
}

func canManageUsers(role string) bool {
	return role == "admin" || role == "teamlead"
}

func lowerPtr(value *string) *string {
	if value == nil {
		return nil
	}
	lower := strings.ToLower(*value)
	return &lower
}

type managerIDScanner struct {
	user *User
}

func managerIDScanTarget(user *User) *managerIDScanner {
	return &managerIDScanner{user: user}
}

func (scanner *managerIDScanner) Scan(src any) error {
	if src == nil {
		scanner.user.ManagerID = nil
		return nil
	}

	switch value := src.(type) {
	case int64:
		scanner.user.ManagerID = &value
	case int32:
		converted := int64(value)
		scanner.user.ManagerID = &converted
	case []byte:
		parsed, err := strconv.ParseInt(string(value), 10, 64)
		if err != nil {
			return err
		}
		scanner.user.ManagerID = &parsed
	case string:
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return err
		}
		scanner.user.ManagerID = &parsed
	default:
		return fmt.Errorf("unsupported manager_id type %T", src)
	}

	return nil
}

type avatarScanner struct {
	user *User
}

func avatarScanTarget(user *User) *avatarScanner {
	return &avatarScanner{user: user}
}

func (scanner *avatarScanner) Scan(src any) error {
	if src == nil {
		scanner.user.AvatarURL = nil
		return nil
	}

	switch value := src.(type) {
	case string:
		scanner.user.AvatarURL = &value
	case []byte:
		converted := string(value)
		scanner.user.AvatarURL = &converted
	default:
		return fmt.Errorf("unsupported avatar_url type %T", src)
	}

	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func campaignSelectQuery(where string) string {
	return campaignSelectFrom("campaigns") + " WHERE " + where
}

func campaignSelectFrom(source string) string {
	return `SELECT c.id, c.team_id, c.user_id, c.name, c.slug,
	              c.domain_id, d.domain, c.traffic_source_id, c.alias, c.group_name, c.source_name,
	              c.flow_rotation, c.cost_model, c.cost_value, c.cost_currency,
	              c.cost_from_param, c.traffic_loss, c.uniqueness, c.use_cookies,
	              c.uniqueness_ttl_hours, c.api_token, c.parameters, c.s2s_postbacks,
	              c.notes, c.status
	       FROM ` + source + ` c
	       LEFT JOIN domains d ON d.id = c.domain_id AND d.team_id = c.team_id`
}

func scanCampaign(row scanner) (Campaign, error) {
	var item Campaign
	var domainID pgtype.Int8
	var domainName pgtype.Text
	var trafficSourceID pgtype.Int8
	var groupName pgtype.Text
	var sourceName pgtype.Text
	var notes pgtype.Text
	var parameters []byte
	var s2sPostbacks []byte

	err := row.Scan(
		&item.ID,
		&item.TeamID,
		&item.UserID,
		&item.Name,
		&item.Slug,
		&domainID,
		&domainName,
		&trafficSourceID,
		&item.Alias,
		&groupName,
		&sourceName,
		&item.FlowRotation,
		&item.CostModel,
		&item.CostValue,
		&item.CostCurrency,
		&item.CostFromParam,
		&item.TrafficLoss,
		&item.Uniqueness,
		&item.UseCookies,
		&item.UniquenessTTLHours,
		&item.APIToken,
		&parameters,
		&s2sPostbacks,
		&notes,
		&item.Status,
	)
	if err != nil {
		return Campaign{}, err
	}
	if domainID.Valid {
		item.DomainID = &domainID.Int64
	}
	if domainName.Valid {
		item.DomainName = &domainName.String
	}
	if trafficSourceID.Valid {
		item.TrafficSourceID = &trafficSourceID.Int64
	}
	if groupName.Valid {
		item.GroupName = &groupName.String
	}
	if sourceName.Valid {
		item.SourceName = &sourceName.String
	}
	if notes.Valid {
		item.Notes = &notes.String
	}
	item.Parameters = map[string]string{}
	item.S2SPostbacks = map[string]string{}
	_ = json.Unmarshal(parameters, &item.Parameters)
	_ = json.Unmarshal(s2sPostbacks, &item.S2SPostbacks)
	return item, nil
}

func scanTrafficSource(row scanner) (TrafficSource, error) {
	var item TrafficSource
	var postbackURL pgtype.Text
	var notes pgtype.Text
	var parameters []byte

	err := row.Scan(
		&item.ID,
		&item.TeamID,
		&item.UserID,
		&item.Name,
		&postbackURL,
		&parameters,
		&notes,
	)
	if err != nil {
		return TrafficSource{}, err
	}
	if postbackURL.Valid {
		item.PostbackURL = &postbackURL.String
	}
	if notes.Valid {
		item.Notes = &notes.String
	}
	item.Parameters = map[string]string{}
	_ = json.Unmarshal(parameters, &item.Parameters)
	return item, nil
}

func scanFlow(row scanner) (Flow, error) {
	var item Flow
	var notes pgtype.Text
	err := row.Scan(
		&item.ID,
		&item.CampaignID,
		&item.Name,
		&item.FlowType,
		&item.Position,
		&item.CollectClicks,
		&item.Status,
		&notes,
	)
	if err != nil {
		return Flow{}, err
	}
	if notes.Valid {
		item.Notes = &notes.String
	}
	return item, nil
}

type normalizedCampaignInput struct {
	flowRotation       string
	costModel          string
	costCurrency       string
	uniqueness         string
	uniquenessTTLHours int
}

func normalizeCampaignInput(flowRotation, costModel, costCurrency, uniqueness string, ttl int) normalizedCampaignInput {
	if flowRotation != "weight" {
		flowRotation = "position"
	}
	if costModel != "cpm" {
		costModel = "cpc"
	}
	costCurrency = normalizeCurrency(costCurrency)
	if uniqueness != "ip" && uniqueness != "parameter" {
		uniqueness = "ip_ua"
	}
	if ttl <= 0 {
		ttl = 24
	}
	return normalizedCampaignInput{
		flowRotation:       flowRotation,
		costModel:          costModel,
		costCurrency:       costCurrency,
		uniqueness:         uniqueness,
		uniquenessTTLHours: ttl,
	}
}

func normalizeOptional(value *string, fallback string, allowed map[string]bool) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if !allowed[normalized] {
		normalized = fallback
	}
	return &normalized
}

func normalizeCurrency(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if len(value) != 3 {
		return "EUR"
	}
	return value
}

func normalizeCurrencyPtr(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := normalizeCurrency(*value)
	return &normalized
}

func jsonMapValue(values map[string]string) []byte {
	raw, _ := json.Marshal(nonNilStringMap(values))
	return raw
}

func jsonMapPtr(values map[string]string) any {
	if values == nil {
		return nil
	}
	return jsonMapValue(values)
}

func nonNilStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	return values
}

func normalizeAlias(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	builder := strings.Builder{}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' {
			builder.WriteRune(char)
		}
	}
	return builder.String()
}

func normalizeAliasPtr(value *string) *string {
	if value == nil {
		return nil
	}
	alias := normalizeAlias(*value)
	if alias == "" {
		alias = randomAlias()
	}
	return &alias
}

func randomAlias() string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	bytes := make([]byte, 6)
	if _, err := rand.Read(bytes); err != nil {
		return "K" + strconv.FormatInt(time.Now().UnixNano(), 36)[:5]
	}
	for index, value := range bytes {
		bytes[index] = alphabet[int(value)%len(alphabet)]
	}
	return string(bytes)
}

func randomSuffix(size int) string {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return strings.TrimRight(base64.RawURLEncoding.EncodeToString(bytes), "=")[:size]
}

func scanDomain(row scanner) (Domain, error) {
	var item Domain
	var groupName pgtype.Text
	var indexCampaignID pgtype.Int8
	var indexCampaignName pgtype.Text
	var indexCampaignSlug pgtype.Text

	err := row.Scan(
		&item.ID,
		&item.TeamID,
		&item.UserID,
		&item.Domain,
		&groupName,
		&item.Status,
		&item.AllowIndexing,
		&item.AllowAdminAccess,
		&item.HTTPSOnly,
		&indexCampaignID,
		&indexCampaignName,
		&indexCampaignSlug,
		&item.CampaignsCount,
	)
	if err != nil {
		return Domain{}, err
	}

	if groupName.Valid {
		item.GroupName = &groupName.String
	}
	if indexCampaignID.Valid {
		item.IndexCampaignID = &indexCampaignID.Int64
	}
	if indexCampaignName.Valid {
		item.IndexCampaignName = &indexCampaignName.String
	}
	if indexCampaignSlug.Valid {
		item.IndexCampaignSlug = &indexCampaignSlug.String
	}

	return item, nil
}

func parseDomains(value string) []string {
	parts := strings.Split(value, ",")
	items := []string{}
	seen := map[string]bool{}
	for _, part := range parts {
		domain, ok := normalizeDomain(part)
		if !ok || seen[domain] {
			continue
		}
		seen[domain] = true
		items = append(items, domain)
	}
	return items
}

func normalizeDomain(value string) (string, bool) {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "", false
	}

	if strings.Contains(value, "://") {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", false
		}
		value = parsed.Host
	} else if index := strings.Index(value, "/"); index >= 0 {
		value = value[:index]
	}

	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}

	value = strings.Trim(value, "[]")
	value = strings.TrimSuffix(value, ".")
	if value == "" || !strings.Contains(value, ".") || strings.ContainsAny(value, " \t\r\n:/") {
		return "", false
	}

	return value, true
}

func validDomainStatus(status string) bool {
	switch status {
	case "ok", "awaiting_dns", "disabled":
		return true
	default:
		return false
	}
}

func nullableTrim(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func nullableTrimPtr(value *string) *string {
	if value == nil {
		return nil
	}
	return nullableTrim(*value)
}

func (app *App) requireKnownDomain(w http.ResponseWriter, r *http.Request) (*Domain, bool) {
	host := requestHost(r)
	if isLocalAdminHost(host) {
		return nil, true
	}

	domain, err := app.domainByHost(r.Context(), host)
	if err != nil {
		writeError(w, http.StatusNotFound, "Domain not parked")
		return nil, false
	}

	return &domain, true
}

func (app *App) domainByHost(ctx context.Context, host string) (Domain, error) {
	return scanDomain(app.db.QueryRow(
		ctx,
		`SELECT d.id, d.team_id, d.user_id, d.domain, d.group_name, d.status,
		        d.allow_indexing, d.allow_admin_access, d.https_only,
		        d.index_campaign_id, c.name, c.slug,
		        CASE WHEN d.index_campaign_id IS NULL THEN 0 ELSE 1 END
		 FROM domains d
		 LEFT JOIN campaigns c ON c.id = d.index_campaign_id AND c.team_id = d.team_id
		 WHERE d.domain = $1 AND d.status = 'ok'`,
		host,
	))
}

func (app *App) domainByHostAnyStatus(ctx context.Context, host string) (Domain, error) {
	return scanDomain(app.db.QueryRow(
		ctx,
		`SELECT d.id, d.team_id, d.user_id, d.domain, d.group_name, d.status,
		        d.allow_indexing, d.allow_admin_access, d.https_only,
		        d.index_campaign_id, c.name, c.slug,
		        CASE WHEN d.index_campaign_id IS NULL THEN 0 ELSE 1 END
		 FROM domains d
		 LEFT JOIN campaigns c ON c.id = d.index_campaign_id AND c.team_id = d.team_id
		 WHERE d.domain = $1 AND d.status <> 'disabled'`,
		host,
	))
}

func (app *App) adminAccessAllowed(r *http.Request) bool {
	host := requestHost(r)
	if isLocalAdminHost(host) {
		return true
	}

	domain, err := app.domainByHostAnyStatus(r.Context(), host)
	if err != nil {
		return true
	}
	return domain.AllowAdminAccess
}

func requestHost(r *http.Request) string {
	host := r.Host
	if forwardedHost := r.Header.Get("X-Forwarded-Host"); forwardedHost != "" {
		host = strings.Split(forwardedHost, ",")[0]
	}
	host = strings.TrimSpace(strings.ToLower(host))
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}
	host = strings.Trim(host, "[]")
	return strings.TrimSuffix(host, ".")
}

func isLocalAdminHost(host string) bool {
	return host == "" || host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func appendClickParams(rawURL, clickID string, campaignID int64) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	values := parsed.Query()
	values.Set("subid", clickID)
	values.Set("click_id", clickID)
	values.Set("campaign_id", strconv.FormatInt(campaignID, 10))
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func detectOS(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "windows"):
		return "windows"
	case strings.Contains(ua, "mac os"):
		return "macos"
	case strings.Contains(ua, "android"):
		return "android"
	case strings.Contains(ua, "iphone"), strings.Contains(ua, "ipad"):
		return "ios"
	case strings.Contains(ua, "linux"):
		return "linux"
	default:
		return "unknown"
	}
}

func detectBrowser(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "edg/"):
		return "edge"
	case strings.Contains(ua, "chrome/"):
		return "chrome"
	case strings.Contains(ua, "firefox/"):
		return "firefox"
	case strings.Contains(ua, "safari/"):
		return "safari"
	default:
		return "unknown"
	}
}

func detectDeviceType(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "tablet"), strings.Contains(ua, "ipad"):
		return "Tablet"
	case strings.Contains(ua, "mobile"), strings.Contains(ua, "android"), strings.Contains(ua, "iphone"):
		return "Mobile phone"
	default:
		return "Desktop"
	}
}

func detectDeviceModel(userAgent string) string {
	ua := strings.TrimSpace(userAgent)
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "iphone"):
		return "iPhone"
	case strings.Contains(lower, "ipad"):
		return "iPad"
	case strings.Contains(lower, "android"):
		if model := androidDeviceModel(ua); model != "" {
			return model
		}
		return "Android"
	case strings.Contains(lower, "macintosh"), strings.Contains(lower, "mac os"):
		return "Mac"
	case strings.Contains(lower, "windows"):
		return "Windows PC"
	case strings.Contains(lower, "linux"):
		return "Linux PC"
	default:
		return ""
	}
}

func androidDeviceModel(userAgent string) string {
	start := strings.Index(userAgent, "(")
	end := strings.Index(userAgent, ")")
	if start == -1 || end == -1 || end <= start {
		return ""
	}
	parts := strings.Split(userAgent[start+1:end], ";")
	for index := len(parts) - 1; index >= 0; index-- {
		part := strings.TrimSpace(parts[index])
		if buildIndex := strings.Index(strings.ToLower(part), " build/"); buildIndex > 0 {
			return strings.TrimSpace(part[:buildIndex])
		}
	}
	return ""
}

func isBot(userAgent string) bool {
	ua := strings.ToLower(userAgent)
	return strings.Contains(ua, "bot") || strings.Contains(ua, "crawler") || strings.Contains(ua, "spider") || strings.Contains(ua, "headless")
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func floatFromQuery(value string) float64 {
	parsed, _ := strconv.ParseFloat(strings.TrimSpace(value), 64)
	return parsed
}

func firstLanguage(value string) string {
	if value == "" {
		return ""
	}
	return strings.TrimSpace(strings.Split(strings.Split(value, ",")[0], ";")[0])
}

func countryFromRequest(r *http.Request) string {
	query := r.URL.Query()
	return normalizeCountryCode(firstNonEmpty(
		query.Get("country"),
		query.Get("country_code"),
		r.Header.Get("CF-IPCountry"),
		r.Header.Get("X-Country-Code"),
		r.Header.Get("X-Country"),
		countryFromAcceptLanguage(r.Header.Get("Accept-Language")),
	))
}

func countryFromAcceptLanguage(value string) string {
	language := firstLanguage(value)
	if language == "" {
		return ""
	}
	parts := strings.FieldsFunc(language, func(r rune) bool {
		return r == '-' || r == '_'
	})
	if len(parts) < 2 {
		return ""
	}
	return parts[len(parts)-1]
}

func normalizeCountryCode(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if len(value) != 2 {
		return ""
	}
	for _, char := range value {
		if char < 'A' || char > 'Z' {
			return ""
		}
	}
	return value
}

func cityFromRequest(r *http.Request, ip string) string {
	query := r.URL.Query()
	city := firstNonEmpty(
		query.Get("city"),
		query.Get("geo_city"),
		r.Header.Get("CF-IPCity"),
		r.Header.Get("X-Geo-City"),
		r.Header.Get("X-City"),
		r.Header.Get("X-Forwarded-City"),
	)
	if city != "" {
		return city
	}
	if isLocalIP(ip) {
		return "Local"
	}
	return ""
}

func isLocalIP(value string) bool {
	ip := net.ParseIP(value)
	if ip == nil {
		return value == "localhost"
	}
	return ip.IsLoopback() || ip.IsPrivate()
}

func maskedIP(ip string, keepParts int) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}
	ipv4 := parsed.To4()
	if ipv4 == nil {
		return ""
	}
	parts := strings.Split(ipv4.String(), ".")
	for index := keepParts; index < len(parts); index++ {
		parts[index] = "*"
	}
	return strings.Join(parts, ".")
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizeAvatarDataURL(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if len(value) > 3_000_000 || !strings.HasPrefix(value, "data:") {
		return "", false
	}

	header, payload, ok := strings.Cut(value, ",")
	if !ok || !strings.HasSuffix(strings.ToLower(header), ";base64") {
		return "", false
	}

	mimeType := strings.TrimPrefix(strings.ToLower(strings.TrimSuffix(header, ";base64")), "data:")
	switch mimeType {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
	default:
		return "", false
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(decoded) == 0 || len(decoded) > 2*1024*1024 {
		return "", false
	}

	return "data:" + mimeType + ";base64," + payload, true
}

func textValue(value pgtype.Text) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func int64FromAny(value any) int64 {
	switch typed := value.(type) {
	case float64:
		return int64(typed)
	case int64:
		return typed
	case int:
		return int64(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return parsed
	case string:
		parsed, _ := strconv.ParseInt(typed, 10, 64)
		return parsed
	default:
		return 0
	}
}

func float64FromAny(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int64:
		return float64(typed)
	case int:
		return float64(typed)
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	case string:
		parsed, _ := strconv.ParseFloat(typed, 64)
		return parsed
	default:
		return 0
	}
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func boolFromAny(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case float64:
		return typed != 0
	case int:
		return typed != 0
	case string:
		return typed == "1" || strings.EqualFold(typed, "true") || strings.EqualFold(typed, "yes")
	default:
		return false
	}
}

func osLogo(osName string) string {
	switch strings.ToLower(osName) {
	case "android":
		return "android"
	case "ios", "macos":
		return "apple"
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	default:
		return ""
	}
}

func browserLogo(browser string) string {
	switch strings.ToLower(browser) {
	case "chrome":
		return "chrome"
	case "firefox":
		return "firefox"
	case "safari":
		return "safari"
	case "edge":
		return "edge"
	default:
		return ""
	}
}

func applyDateParts(row ClickReportRow) {
	rawTime := stringFromAny(row["date_time"])
	parsed, err := time.Parse("2006-01-02 15:04:05", rawTime)
	if err != nil {
		return
	}
	year, week := parsed.ISOWeek()
	row["year"] = year
	row["month"] = int(parsed.Month())
	row["week"] = week
	row["weekday"] = parsed.Weekday().String()
	row["day"] = parsed.Format("2006-01-02")
	row["hour"] = parsed.Hour()
	row["day_and_hour"] = parsed.Format("2006-01-02 15:00")
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
