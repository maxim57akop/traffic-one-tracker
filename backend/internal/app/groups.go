package app

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

type BuyerGroup struct {
	ID     int64  `json:"id"`
	TeamID int64  `json:"team_id"`
	Name   string `json:"name"`
	LeadID *int64 `json:"lead_id,omitempty"`
	Lead   *User  `json:"lead,omitempty"`
	Buyers []User `json:"buyers"`
}

func (app *App) migrateBuyerGroups(ctx context.Context) error {
	_, err := app.db.Exec(ctx, `
		INSERT INTO buyer_groups (team_id, name, lead_id)
		SELECT u.team_id, u.name, u.id
		FROM users u
		WHERE u.role = 'teamlead'
		  AND u.team_id IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM buyer_groups g WHERE g.lead_id = u.id)
	`)
	if err != nil {
		return err
	}

	_, err = app.db.Exec(ctx, `
		UPDATE users AS b
		SET group_id = g.id
		FROM buyer_groups AS g
		WHERE b.role = 'buyer'
		  AND b.manager_id = g.lead_id
		  AND b.group_id IS NULL
	`)
	return err
}

func (app *App) listBuyerGroups(w http.ResponseWriter, r *http.Request, actor User) {
	if !canManageUsers(actor.Role) {
		writeError(w, http.StatusForbidden, "Only admin and teamlead users can view teams")
		return
	}

	query := "SELECT id FROM buyer_groups WHERE team_id = $1"
	args := []any{actor.TeamID}
	if actor.Role == "teamlead" {
		query += " AND lead_id = $2"
		args = append(args, actor.ID)
	}
	query += " ORDER BY name, id"

	rows, err := app.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load teams")
		return
	}
	defer rows.Close()

	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read team")
			return
		}
		ids = append(ids, id)
	}

	groups := []BuyerGroup{}
	for _, id := range ids {
		group, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not load team")
			return
		}
		groups = append(groups, group)
	}

	writeJSON(w, http.StatusOK, groups)
}

func (app *App) createBuyerGroup(w http.ResponseWriter, r *http.Request, actor User) {
	if actor.Role != "admin" {
		writeError(w, http.StatusForbidden, "Only admin users can create teams")
		return
	}

	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusUnprocessableEntity, "Team name is required")
		return
	}

	var groupID int64
	err := app.db.QueryRow(
		r.Context(),
		`INSERT INTO buyer_groups (team_id, name) VALUES ($1, $2) RETURNING id`,
		actor.TeamID,
		name,
	).Scan(&groupID)
	if err != nil {
		writeDBError(w, err)
		return
	}

	group, err := app.loadBuyerGroup(r.Context(), actor.TeamID, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load team")
		return
	}

	writeJSON(w, http.StatusCreated, group)
}

func (app *App) updateBuyerGroup(w http.ResponseWriter, r *http.Request, actor User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	group, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if !canEditBuyerGroup(actor, group) {
		writeError(w, http.StatusForbidden, "You cannot update this team")
		return
	}

	var input struct {
		Name        *string `json:"name"`
		LeadID      *int64  `json:"lead_id"`
		ClearLeadID bool    `json:"clear_lead_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	name := group.Name
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
		if name == "" {
			writeError(w, http.StatusUnprocessableEntity, "Team name is required")
			return
		}
	}

	leadID := group.LeadID
	if input.ClearLeadID {
		leadID = nil
	} else if input.LeadID != nil {
		if !app.isTeamlead(r.Context(), actor.TeamID, *input.LeadID) {
			writeError(w, http.StatusUnprocessableEntity, "Teamlead must have the teamlead role")
			return
		}
		leadID = input.LeadID
	}

	_, err = app.db.Exec(
		r.Context(),
		`UPDATE buyer_groups
		 SET name = $1, lead_id = $2, updated_at = now()
		 WHERE id = $3 AND team_id = $4`,
		name,
		leadID,
		id,
		actor.TeamID,
	)
	if err != nil {
		writeDBError(w, err)
		return
	}

	if leadID != nil {
		_, _ = app.db.Exec(
			r.Context(),
			`UPDATE users SET manager_id = $1, updated_at = now()
			 WHERE group_id = $2 AND role = 'buyer' AND team_id = $3`,
			*leadID,
			id,
			actor.TeamID,
		)
	} else {
		_, _ = app.db.Exec(
			r.Context(),
			`UPDATE users SET manager_id = NULL, updated_at = now()
			 WHERE group_id = $1 AND role = 'buyer' AND team_id = $2`,
			id,
			actor.TeamID,
		)
	}

	updated, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load team")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

func (app *App) deleteBuyerGroup(w http.ResponseWriter, r *http.Request, actor User) {
	if actor.Role != "admin" {
		writeError(w, http.StatusForbidden, "Only admin users can delete teams")
		return
	}

	id, ok := pathID(w, r)
	if !ok {
		return
	}

	_, err := app.db.Exec(
		r.Context(),
		`UPDATE users SET manager_id = NULL, group_id = NULL, updated_at = now()
		 WHERE group_id = $1 AND team_id = $2`,
		id,
		actor.TeamID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not clear team members")
		return
	}

	tag, err := app.db.Exec(r.Context(), "DELETE FROM buyer_groups WHERE id = $1 AND team_id = $2", id, actor.TeamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete team")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Team not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (app *App) addBuyerGroupMember(w http.ResponseWriter, r *http.Request, actor User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	group, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if !canEditBuyerGroup(actor, group) {
		writeError(w, http.StatusForbidden, "You cannot update this team")
		return
	}

	var input struct {
		UserID int64 `json:"user_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}

	var role string
	err = app.db.QueryRow(
		r.Context(),
		"SELECT role FROM users WHERE id = $1 AND team_id = $2",
		input.UserID,
		actor.TeamID,
	).Scan(&role)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if role != "buyer" {
		writeError(w, http.StatusUnprocessableEntity, "Only buyers can be added to a team")
		return
	}

	_, err = app.db.Exec(
		r.Context(),
		`UPDATE users
		 SET group_id = $1, manager_id = $2, updated_at = now()
		 WHERE id = $3 AND team_id = $4`,
		id,
		group.LeadID,
		input.UserID,
		actor.TeamID,
	)
	if err != nil {
		writeDBError(w, err)
		return
	}

	updated, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load team")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

func (app *App) removeBuyerGroupMember(w http.ResponseWriter, r *http.Request, actor User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	buyerID, err := strconv.ParseInt(r.PathValue("buyerId"), 10, 64)
	if err != nil || buyerID <= 0 {
		writeError(w, http.StatusBadRequest, "Invalid buyer id")
		return
	}

	group, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeNotFoundOrDB(w, err)
		return
	}
	if !canEditBuyerGroup(actor, group) {
		writeError(w, http.StatusForbidden, "You cannot update this team")
		return
	}

	tag, err := app.db.Exec(
		r.Context(),
		`UPDATE users
		 SET group_id = NULL, manager_id = NULL, updated_at = now()
		 WHERE id = $1 AND team_id = $2 AND group_id = $3 AND role = 'buyer'`,
		buyerID,
		actor.TeamID,
		id,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove buyer")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Buyer not found in this team")
		return
	}

	updated, err := app.loadBuyerGroup(r.Context(), actor.TeamID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load team")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

func (app *App) loadBuyerGroup(ctx context.Context, teamID, groupID int64) (BuyerGroup, error) {
	var group BuyerGroup
	var leadID pgtype.Int8
	err := app.db.QueryRow(
		ctx,
		"SELECT id, team_id, name, lead_id FROM buyer_groups WHERE id = $1 AND team_id = $2",
		groupID,
		teamID,
	).Scan(&group.ID, &group.TeamID, &group.Name, &leadID)
	if err != nil {
		return BuyerGroup{}, err
	}
	if leadID.Valid {
		group.LeadID = &leadID.Int64
		lead, leadErr := app.loadGroupUser(ctx, teamID, leadID.Int64)
		if leadErr == nil {
			group.Lead = &lead
		}
	}

	rows, err := app.db.Query(
		ctx,
		`SELECT id, team_id, name, email, role, avatar_url, manager_id
		 FROM users
		 WHERE team_id = $1 AND group_id = $2 AND role = 'buyer'
		 ORDER BY name`,
		teamID,
		groupID,
	)
	if err != nil {
		return BuyerGroup{}, err
	}
	defer rows.Close()

	group.Buyers = []User{}
	for rows.Next() {
		user, scanErr := scanGroupUser(rows)
		if scanErr != nil {
			return BuyerGroup{}, scanErr
		}
		group.Buyers = append(group.Buyers, user)
	}

	return group, nil
}

func (app *App) loadGroupUser(ctx context.Context, teamID, userID int64) (User, error) {
	row := app.db.QueryRow(
		ctx,
		`SELECT id, team_id, name, email, role, avatar_url, manager_id
		 FROM users WHERE id = $1 AND team_id = $2`,
		userID,
		teamID,
	)
	return scanGroupUser(row)
}

func scanGroupUser(row interface{ Scan(dest ...any) error }) (User, error) {
	var user User
	var managerID pgtype.Int8
	if err := row.Scan(&user.ID, &user.TeamID, &user.Name, &user.Email, &user.Role, avatarScanTarget(&user), &managerID); err != nil {
		return User{}, err
	}
	if managerID.Valid {
		user.ManagerID = &managerID.Int64
	}
	return user, nil
}

func canEditBuyerGroup(actor User, group BuyerGroup) bool {
	if actor.Role == "admin" {
		return true
	}
	return actor.Role == "teamlead" && group.LeadID != nil && *group.LeadID == actor.ID
}
