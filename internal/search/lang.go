package search

import (
	"regexp"
	"strings"
)

// Release names carry their language as scene tags ("FRENCH", "VFF",
// "MULTi", "ENGLISH"...). DetectLanguage reads them so every result gets an
// ISO 639-1 language like the direct sources already provide, and so a
// language preference can be applied uniformly.
//
// Matching is on whole tokens only: "fr" must not be found in "from" or
// "Frank". When no tag is present the language stays unknown — assuming
// English would mislabel the many untagged French releases on French
// trackers.
var langTokens = []struct {
	code   string
	tokens []string
}{
	// MULTi before FR: a "MULTi FRENCH" release is multilingual, not French-only.
	{"multi", []string{"MULTI", "MULTI3", "MULTI4", "MULTILANG"}},
	{"fr", []string{"FRENCH", "TRUEFRENCH", "VFF", "VFQ", "VF", "VF2", "FR", "FRA", "FRE", "FRANCAIS", "FRANÇAIS"}},
	// VOSTFR = original (English) text with French subtitles: for a book, English.
	{"en", []string{"ENGLISH", "ENG", "VO", "VOSTFR"}},
	{"de", []string{"GERMAN", "GER", "DEUTSCH"}},
	{"es", []string{"SPANISH", "SPA", "ESPANOL", "ESPAÑOL"}},
	{"it", []string{"ITALIAN", "ITA", "ITALIANO"}},
	{"ru", []string{"RUSSIAN", "RUS"}},
	{"ja", []string{"JAPANESE", "JAP", "JPN"}},
}

var langSplitRe = regexp.MustCompile(`[.\s_\-\[\]()]+`)

// DetectLanguage returns the language code read from the release name and
// the token that decided it, or ("", "") when the name carries no language tag.
func DetectLanguage(title string) (code, token string) {
	parts := langSplitRe.Split(strings.ToUpper(title), -1)
	for _, entry := range langTokens {
		for _, tok := range entry.tokens {
			for _, p := range parts {
				if p == tok {
					return entry.code, tok
				}
			}
		}
	}
	return "", ""
}
