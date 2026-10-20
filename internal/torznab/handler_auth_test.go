package torznab

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JeremiahM37/librarr/internal/config"
	"github.com/JeremiahM37/librarr/internal/search"
)

// An instance that authenticates its users must not expose an anonymous
// search proxy just because TORZNAB_API_KEY was left empty.
func TestHandler_RequiresKeyWhenInstanceHasAuth(t *testing.T) {
	cfg := &config.Config{AuthUsername: "owner", AuthPassword: "owner-password"}
	h := NewHandler(cfg, search.NewManager(cfg, nil, search.NewHealthTracker(3, 300)))

	req := httptest.NewRequest("GET", "/torznab/api?t=caps", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401 when auth is configured and no Torznab key is set", w.Code)
	}

	// Without any authentication the feed stays open, as before.
	req = httptest.NewRequest("GET", "/torznab/api?t=caps", nil)
	w = httptest.NewRecorder()
	newTestHandler("").ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("open instance: got %d, want 200", w.Code)
	}
}
