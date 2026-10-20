package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Manga releases name their volume in many ways ("Dandadan T21",
// "Dandadan - Tome 21", "DanDaDan Vol. 21 (Digital)", "One Piece v105",
// "Berserk #41", "Monster 18"). The series is what precedes the marker, once
// scene tags (language, format, release group) are removed.
var (
	mangaVolumeRes = []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:^|[\s._\-\[(])(?:T|Tome)\s*\.?\s*0*(\d{1,3})(?:\b|[\s._\-\])])`),
		regexp.MustCompile(`(?i)(?:^|[\s._\-\[(])(?:Vol\.?|Volume|v)\s*0*(\d{1,3})(?:\b|[\s._\-\])])`),
		regexp.MustCompile(`#\s*0*(\d{1,3})\b`),
		regexp.MustCompile(`\s0*(\d{1,3})\s*$`),
	}
	mangaExtRe = regexp.MustCompile(`(?i)\.(cbz|cbr|cb7|epub|pdf|zip|rar|mobi|azw3)$`)
	// Tokens that describe the release, not the series.
	mangaTagTokens = map[string]bool{
		"french": true, "truefrench": true, "vff": true, "vfq": true, "vf": true, "fr": true, "fra": true, "fre": true,
		"english": true, "eng": true, "en": true, "vo": true, "vostfr": true, "multi": true,
		"german": true, "spanish": true, "italian": true, "japanese": true, "jap": true, "jpn": true,
		"cbz": true, "cbr": true, "cb7": true, "epub": true, "pdf": true, "ebook": true, "digital": true,
		"scan": true, "scans": true, "webrip": true, "hq": true, "lq": true,
		"notag": true, "nogroup": true, "repack": true, "proper": true,
	}
)

// ParseMangaRelease extracts the series name and volume number from a release
// or file name. ok is false when no volume marker is found; the series is then
// the cleaned name, so callers can still group by it.
func ParseMangaRelease(name string) (series string, volume int, ok bool) {
	base := mangaExtRe.ReplaceAllString(strings.TrimSpace(name), "")
	for _, re := range mangaVolumeRes {
		loc := re.FindStringSubmatchIndex(base)
		if loc == nil {
			continue
		}
		// A number at the very start is not a volume ("20th Century Boys").
		if loc[2] == 0 {
			continue
		}
		n := 0
		for _, c := range base[loc[2]:loc[3]] {
			n = n*10 + int(c-'0')
		}
		if n == 0 {
			continue
		}
		series = cleanMangaSeries(base[:loc[0]])
		if series == "" || series == "Unknown" {
			continue
		}
		return series, n, true
	}
	return cleanMangaSeries(base), 0, false
}

// MangaSeriesName is the series a release belongs to, with or without a
// recognised volume marker.
func MangaSeriesName(name string) string {
	series, _, _ := ParseMangaRelease(name)
	return series
}

// cleanMangaSeries turns the part of a release name before the volume marker
// into a series directory name: scene separators become spaces, bracketed and
// parenthesised tags go, trailing release tags (language, format, group) go.
func cleanMangaSeries(s string) string {
	s = bracketRe.ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\([^)]*\)`).ReplaceAllString(s, " ")
	s = strings.NewReplacer(".", " ", "_", " ").Replace(s)
	words := strings.Fields(s)
	// Drop trailing separators and tags, but keep the words of the title.
	for len(words) > 0 {
		last := strings.ToLower(strings.Trim(words[len(words)-1], "-–—:,"))
		if last == "" || mangaTagTokens[last] {
			words = words[:len(words)-1]
			continue
		}
		break
	}
	// Drop a leading separator left by "- Tome 21" style names.
	for len(words) > 0 && strings.Trim(words[0], "-–—:,") == "" {
		words = words[1:]
	}
	title := strings.Join(words, " ")
	title = strings.TrimRight(title, " -–—:,")
	return sanitizePath(title, 120)
}

// MangaFileName renders the configured file pattern. Supported tokens:
// {series}, {volume}, {volume:02}, {volume:03}, {ext}.
func MangaFileName(pattern, series string, volume int, ext string) string {
	ext = strings.TrimPrefix(ext, ".")
	r := strings.NewReplacer(
		"{series}", sanitizePath(series, 120),
		"{volume:03}", fmt.Sprintf("%03d", volume),
		"{volume:02}", fmt.Sprintf("%02d", volume),
		"{volume}", fmt.Sprintf("%d", volume),
		"{ext}", ext,
	)
	name := strings.TrimSpace(r.Replace(pattern))
	if !strings.HasSuffix(strings.ToLower(name), "."+strings.ToLower(ext)) && ext != "" {
		name += "." + ext
	}
	return name
}

// findSeriesDir looks for an existing directory for the series under the
// configured library roots, so new volumes land next to the ones already
// there (readers such as Kavita keep a series in a single root folder).
// The directory keeps its original name. Returns "" when no root holds it.
func findSeriesDir(roots []string, series string) string {
	want := normalizeSeriesKey(series)
	if want == "" {
		return ""
	}
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
				continue
			}
			if normalizeSeriesKey(e.Name()) == want {
				return filepath.Join(root, e.Name())
			}
		}
	}
	return ""
}

var seriesKeyRe = regexp.MustCompile(`[^\p{L}\p{N}]+`)

// normalizeSeriesKey compares series names loosely: case, punctuation and
// separators do not matter ("DanDaDan", "Dandadan", "dan-da-dan" all match).
func normalizeSeriesKey(s string) string {
	return strings.ToLower(seriesKeyRe.ReplaceAllString(s, ""))
}
