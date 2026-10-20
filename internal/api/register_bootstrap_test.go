package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JeremiahM37/librarr/internal/config"
	"github.com/JeremiahM37/librarr/internal/db"
)

func postRegister(t *testing.T, h http.HandlerFunc, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/register", strings.NewReader(`{"username":"someone","password":"hunter22"}`))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

// With AUTH_USERNAME/AUTH_PASSWORD configured and no user in the database,
// /api/register (an auth-exempt path) must not hand the admin role to the
// first caller: that would let anyone reaching the port take over the
// instance and lock the operator out.
func TestRegister_BootstrapRefusedWhenEnvAuthIsConfigured(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "librarr.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	cfg := &config.Config{AuthUsername: "owner", AuthPassword: "owner-password"}

	rr := postRegister(t, handleRegister(cfg, database, NewSessionStore()), nil)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("anonymous bootstrap with env auth configured: got %d, want 403 (%s)", rr.Code, rr.Body.String())
	}
	if n, _ := database.CountUsers(); n != 0 {
		t.Fatalf("a user was created: %d", n)
	}

	// The operator, signed in through the legacy login, may still bootstrap.
	store := NewSessionStore()
	token, err := store.Create(0, cfg.AuthUsername, "admin")
	if err != nil {
		t.Fatal(err)
	}
	rr = postRegister(t, handleRegister(cfg, database, store), &http.Cookie{Name: sessionCookieName, Value: token})
	if rr.Code != http.StatusCreated {
		t.Fatalf("bootstrap by the signed-in operator: got %d, want 201 (%s)", rr.Code, rr.Body.String())
	}
	if n, _ := database.CountUsers(); n != 1 {
		t.Fatalf("expected one user after bootstrap, got %d", n)
	}
}

// An instance without any authentication keeps the open bootstrap: the first
// registered user becomes admin, as documented.
func TestRegister_BootstrapStillOpenWithoutAuth(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "librarr.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	rr := postRegister(t, handleRegister(&config.Config{}, database, NewSessionStore()), nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("open instance bootstrap: got %d, want 201 (%s)", rr.Code, rr.Body.String())
	}
}
