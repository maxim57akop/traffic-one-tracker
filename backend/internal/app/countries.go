package app

import "net/http"

func (app *App) countries(w http.ResponseWriter, r *http.Request, _ User) {
	rows, err := app.db.Query(r.Context(), "SELECT code, name FROM countries ORDER BY name")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load countries")
		return
	}
	defer rows.Close()

	items := []Country{}
	for rows.Next() {
		var item Country
		if err := rows.Scan(&item.Code, &item.Name); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read country")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}
