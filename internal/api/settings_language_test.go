package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JeremiahM37/librarr/internal/config"
	"github.com/JeremiahM37/librarr/internal/db"
	"github.com/JeremiahM37/librarr/internal/search"
)

// The language preference is exposed by GET /api/settings, applied at once by
// POST /api/settings and persisted so config.Load picks it up at startup.
func TestSettings_LanguagePreferenceRoundTrip(t *testing.T) {
	dir := t.TempDir()
	cfg := &config.Config{SettingsFile: filepath.Join(dir, "settings.json"), LanguagePreferred: []string{"en"}, LanguageMode: "prefer", LanguageBonus: 30}
	database, err := db.New(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	s := &Server{cfg: cfg, db: database, searchMgr: search.NewManager(cfg, nil, search.NewHealthTracker(3, 300))}

	rr := httptest.NewRecorder()
	s.handleGetSettings(rr, httptest.NewRequest("GET", "/api/settings", nil))
	var got map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["language_preferred"] != "en" || got["language_mode"] != "prefer" || got["language_bonus"] != 30.0 {
		t.Fatalf("GET defaults: %v %v %v", got["language_preferred"], got["language_mode"], got["language_bonus"])
	}

	body := strings.NewReader(`{"language_preferred":"fr, MULTi","language_mode":"require","language_bonus":40}`)
	req := httptest.NewRequest("POST", "/api/settings", body)
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	s.handleSaveSettings(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST: %d %s", rr.Code, rr.Body.String())
	}
	if strings.Join(cfg.LanguagePreferred, ",") != "fr,multi" || cfg.LanguageMode != "require" || cfg.LanguageBonus != 40 {
		t.Fatalf("runtime config not updated: %v %s %v", cfg.LanguagePreferred, cfg.LanguageMode, cfg.LanguageBonus)
	}
	raw, err := os.ReadFile(cfg.SettingsFile)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"language_preferred": "fr, MULTi"`) {
		t.Fatalf("settings.json does not hold the preference: %s", raw)
	}

	// An unknown mode is ignored rather than applied.
	req = httptest.NewRequest("POST", "/api/settings", strings.NewReader(`{"language_mode":"whatever"}`))
	req.Header.Set("Content-Type", "application/json")
	s.handleSaveSettings(httptest.NewRecorder(), req)
	if cfg.LanguageMode != "require" {
		t.Fatalf("invalid mode applied: %s", cfg.LanguageMode)
	}
}
