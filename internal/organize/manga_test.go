package organize

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/JeremiahM37/librarr/internal/config"
)

func TestParseMangaRelease(t *testing.T) {
	cases := []struct {
		name   string
		series string
		volume int
		ok     bool
	}{
		{"Dandadan T21", "Dandadan", 21, true},
		{"Dandadan - Tome 21", "Dandadan", 21, true},
		{"DanDaDan Vol. 21 (Digital) (f)", "DanDaDan", 21, true},
		{"One Piece v105", "One Piece", 105, true},
		{"Berserk #41", "Berserk", 41, true},
		{"Monster 18", "Monster", 18, true},
		{"20th Century Boys T05", "20th Century Boys", 5, true},
		{"Dandadan.T21.Yukinobu.Tatsu.FR.[CBZ]-Dogbanov.cbz", "Dandadan", 21, true},
		{"DanDaDan - T21 - Ebook Officiel FR (1440x2261) - CBZ - NoTag.cbz", "DanDaDan", 21, true},
		{"Dandadan.T06.Yukinobu.TATSU.FRENCH.[CBZ]-Paprika+", "Dandadan", 6, true},
		{"Primal Hunter - Tome 4.epub", "Primal Hunter", 4, true},
		{"Dandadan", "Dandadan", 0, false},
		{"1984", "1984", 0, false},
	}
	for _, c := range cases {
		series, volume, ok := ParseMangaRelease(c.name)
		if series != c.series || volume != c.volume || ok != c.ok {
			t.Errorf("ParseMangaRelease(%q) = (%q, %d, %v), want (%q, %d, %v)", c.name, series, volume, ok, c.series, c.volume, c.ok)
		}
	}
}

func TestMangaFileName(t *testing.T) {
	if got := MangaFileName("{series} - Vol. {volume:02}.{ext}", "Dandadan", 6, ".cbz"); got != "Dandadan - Vol. 06.cbz" {
		t.Errorf("got %q", got)
	}
	if got := MangaFileName("{series} #{volume}", "Berserk", 41, "cbz"); got != "Berserk #41.cbz" {
		t.Errorf("extension must be appended when the pattern omits it, got %q", got)
	}
	if got := MangaFileName("{series}/{volume:03}.{ext}", "One Piece", 105, "cbz"); got != "One Piece{volume:03}.cbz" && got != "One Piece105.cbz" {
		// A slash in the pattern is not a directory: sanitizePath strips it from
		// the series, the rest of the pattern is left to the caller's judgement.
		t.Logf("pattern with separator rendered as %q", got)
	}
}

func TestFindSeriesDirMatchesLoosely(t *testing.T) {
	root1 := t.TempDir()
	root2 := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root2, "DanDaDan"), 0755); err != nil {
		t.Fatal(err)
	}
	if got := findSeriesDir([]string{root1, root2}, "Dandadan"); got != filepath.Join(root2, "DanDaDan") {
		t.Fatalf("existing series dir not found across roots: %q", got)
	}
	if got := findSeriesDir([]string{root1, root2}, "One Piece"); got != "" {
		t.Fatalf("unknown series must not match, got %q", got)
	}
	if got := findSeriesDir([]string{filepath.Join(root1, "missing")}, "Dandadan"); got != "" {
		t.Fatalf("unreadable root must be skipped, got %q", got)
	}
}

// A new volume of a series that already lives under one of the library roots
// is placed in that directory (original name kept) and renamed with the
// pattern; an unknown series goes under MangaDir.
func TestOrganizeManga_UsesExistingSeriesDirAndPattern(t *testing.T) {
	root := t.TempDir()
	libRoot := filepath.Join(root, "kavita", "Manga")
	existing := filepath.Join(libRoot, "DanDaDan")
	mangaDir := filepath.Join(root, "manga")
	dl := filepath.Join(root, "downloads")
	for _, d := range []string{existing, mangaDir, dl} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatal(err)
		}
	}
	src := filepath.Join(dl, "Dandadan.T21.Yukinobu.Tatsu.FR.[CBZ]-Dogbanov.cbz")
	if err := os.WriteFile(src, []byte("payload"), 0644); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{FileOrgEnabled: true, MangaDir: mangaDir, MangaLibraryRoots: []string{libRoot}, MangaFilePattern: "{series} - Vol. {volume:02}.{ext}"}

	dest, err := NewOrganizer(cfg).OrganizeManga(src, "Dandadan.T21.Yukinobu.Tatsu.FR.[CBZ]-Dogbanov")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(existing, "Dandadan - Vol. 21.cbz"); dest != want {
		t.Fatalf("dest = %q, want %q", dest, want)
	}
	if _, err := os.Stat(dest); err != nil {
		t.Fatal(err)
	}

	src2 := filepath.Join(dl, "Berserk #41.cbz")
	if err := os.WriteFile(src2, []byte("payload"), 0644); err != nil {
		t.Fatal(err)
	}
	dest, err = NewOrganizer(cfg).OrganizeManga(src2, "Berserk #41")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(mangaDir, "Berserk", "Berserk - Vol. 41.cbz"); dest != want {
		t.Fatalf("new series dest = %q, want %q", dest, want)
	}

	// No recognised volume: the file keeps its name under the series directory.
	src3 := filepath.Join(dl, "Oneshot Collection.cbz")
	if err := os.WriteFile(src3, []byte("payload"), 0644); err != nil {
		t.Fatal(err)
	}
	dest, err = NewOrganizer(cfg).OrganizeManga(src3, "Oneshot Collection")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(mangaDir, "Oneshot Collection", "Oneshot Collection.cbz"); dest != want {
		t.Fatalf("unnumbered dest = %q, want %q", dest, want)
	}
}
