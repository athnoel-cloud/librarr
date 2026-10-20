package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Credentials may only be reflected to the exact same host: a substring match
// let a sibling subdomain or a longer host name read authenticated responses.
func TestCORS_CredentialsOnlyForExactOrigin(t *testing.T) {
	s := &Server{}
	handler := s.corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		origin string
		allow  bool
	}{
		{"http://librarr.local", true},
		{"https://librarr.local", true},
		{"http://xlibrarr.local", false},
		{"http://librarr.local.evil.example", false},
		{"http://librarr.local:9999", false},
		{"http://evil.example/?librarr.local", false},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/api/library", nil)
		req.Host = "librarr.local"
		req.Header.Set("Origin", c.origin)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		gotOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		gotCreds := rr.Header().Get("Access-Control-Allow-Credentials")
		if c.allow && (gotOrigin != c.origin || gotCreds != "true") {
			t.Errorf("origin %s: expected credentials to be allowed, got origin=%q creds=%q", c.origin, gotOrigin, gotCreds)
		}
		if !c.allow && (gotOrigin != "" || gotCreds != "") {
			t.Errorf("origin %s: must not be reflected with credentials, got origin=%q creds=%q", c.origin, gotOrigin, gotCreds)
		}
	}
}
