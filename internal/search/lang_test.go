package search

import "testing"

func TestDetectLanguage(t *testing.T) {
	cases := []struct {
		title string
		code  string
	}{
		{"Primal.Hunter.Tome.1.Zogarth.2024.FR.[EPUB]-NOTAG", "fr"},
		{"Dandadan.T06.Yukinobu.TATSU.FRENCH.[CBZ]-Paprika+", "fr"},
		{"Zogarth.Primal.Hunter.T1.2024.VFF.MP3-NoTAG", "fr"},
		{"Some Book (TrueFrench)", "fr"},
		{"The Primal Hunter 2 by Zogarth EPUB", ""},
		{"Frank Herbert - Dune", ""},
		{"Letters from Earth", ""},
		{"Dune MULTi FRENCH EPUB", "multi"},
		{"Dune ENGLISH EPUB", "en"},
		{"Dune VOSTFR", "en"},
		{"Die Verwandlung GERMAN", "de"},
		{"", ""},
	}
	for _, c := range cases {
		if got, _ := DetectLanguage(c.title); got != c.code {
			t.Errorf("DetectLanguage(%q) = %q, want %q", c.title, got, c.code)
		}
	}
}
