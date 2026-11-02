package file

import (
	"github.com/jesseduffield/lazygit/pkg/config"
	. "github.com/jesseduffield/lazygit/pkg/integration/components"
)

// Behaviour: with the file tree turned off both actions are unavailable and say so.
var AcceptanceCollapseInFlatView = NewIntegrationTest(NewIntegrationTestArgs{
	Description:  "Collapse all and expand all are unavailable in flat view",
	ExtraCmdArgs: []string{},
	Skip:         false,
	SetupConfig: func(config *config.AppConfig) {
		config.GetUserConfig().Gui.ShowFileTree = false
	},
	SetupRepo: func(shell *Shell) {
		shell.CreateDir("committed")
		shell.CreateFileAndAdd("committed/leaf-c", "c\n")
		shell.Commit("commit with a directory")
		shell.CreateDir("dir1")
		shell.CreateFile("dir1/leaf-a", "a\n")
		shell.CreateFile("top-file", "t\n")
	},
	Run: func(t *TestDriver, keys config.KeybindingConfig) {
		t.Views().Files().
			IsFocused().
			Lines(
				Contains("dir1/leaf-a").IsSelected(),
				Contains("top-file"),
			).
			Press("-")
		t.ExpectToast(Contains("Not available in flat view"))
		t.Views().Files().
			Lines(
				Contains("dir1/leaf-a").IsSelected(),
				Contains("top-file"),
			).
			Press("=")
		t.ExpectToast(Contains("Not available in flat view"))

		t.Views().Commits().
			Focus().
			Lines(Contains("commit with a directory").IsSelected()).
			PressEnter()
		t.Views().CommitFiles().
			IsFocused().
			Lines(Contains("committed/leaf-c").IsSelected()).
			Press("-")
		t.ExpectToast(Contains("Not available in flat view"))
		t.Views().CommitFiles().
			Lines(Contains("committed/leaf-c").IsSelected()).
			Press("=")
		t.ExpectToast(Contains("Not available in flat view"))
	},
})
