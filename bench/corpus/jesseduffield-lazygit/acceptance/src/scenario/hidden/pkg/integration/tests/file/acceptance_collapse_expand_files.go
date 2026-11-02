package file

import (
	"github.com/jesseduffield/lazygit/pkg/config"
	. "github.com/jesseduffield/lazygit/pkg/integration/components"
)

// Behaviour: "-" collapses and "=" expands every directory of the Files tree; collapsing moves the selection to the
// top-level directory of the selected item, expanding keeps the selected item; both actions appear in the keybindings menu.
var AcceptanceCollapseExpandFiles = NewIntegrationTest(NewIntegrationTestArgs{
	Description:  "Collapse and expand all directories in the Files tree",
	ExtraCmdArgs: []string{},
	Skip:         false,
	SetupConfig:  func(config *config.AppConfig) {},
	SetupRepo: func(shell *Shell) {
		shell.CreateDir("dir1/sub1")
		shell.CreateFile("dir1/sub1/leaf-a", "a\n")
		shell.CreateDir("dir1/sub2")
		shell.CreateFile("dir1/sub2/leaf-b", "b\n")
		shell.CreateDir("dir2")
		shell.CreateFile("dir2/leaf-c", "c\n")
		shell.CreateFile("top-file", "t\n")
	},
	Run: func(t *TestDriver, keys config.KeybindingConfig) {
		t.Views().Files().
			IsFocused().
			Lines(
				Contains("dir1").IsSelected(),
				Contains("sub1"),
				Contains("leaf-a"),
				Contains("sub2"),
				Contains("leaf-b"),
				Contains("dir2"),
				Contains("leaf-c"),
				Contains("top-file"),
			).
			NavigateToLine(Contains("leaf-b")).
			Press("-").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("dir2"),
				Contains("top-file"),
			).
			// opening one directory shows that its subdirectories were collapsed as well
			PressEnter().
			Lines(
				Contains("dir1").IsSelected(),
				Contains("sub1"),
				Contains("sub2"),
				Contains("dir2"),
				Contains("top-file"),
			).
			Press("=").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("sub1"),
				Contains("leaf-a"),
				Contains("sub2"),
				Contains("leaf-b"),
				Contains("dir2"),
				Contains("leaf-c"),
				Contains("top-file"),
			).
			NavigateToLine(Contains("top-file")).
			Press("-").
			Lines(
				Contains("dir1"),
				Contains("dir2"),
				Contains("top-file").IsSelected(),
			).
			Press("=").
			SelectedLine(Contains("top-file"))

		t.Views().Files().Press(keys.Universal.OptionMenu)
		t.Views().Menu().
			IsFocused().
			Content(Contains("Collapse all files").Contains("Expand all files"))
		t.Views().Menu().PressEscape()
	},
})
