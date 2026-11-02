package file

import (
	"github.com/jesseduffield/lazygit/pkg/config"
	. "github.com/jesseduffield/lazygit/pkg/integration/components"
)

// Behaviour: the same "-" / "=" actions work in the file tree of a commit.
var AcceptanceCollapseExpandCommitFiles = NewIntegrationTest(NewIntegrationTestArgs{
	Description:  "Collapse and expand all directories in the tree of a commit's files",
	ExtraCmdArgs: []string{},
	Skip:         false,
	SetupConfig:  func(config *config.AppConfig) {},
	SetupRepo: func(shell *Shell) {
		shell.CreateDir("dir1/sub1")
		shell.CreateFileAndAdd("dir1/sub1/leaf-a", "a\n")
		shell.CreateDir("dir1/sub2")
		shell.CreateFileAndAdd("dir1/sub2/leaf-b", "b\n")
		shell.CreateDir("dir2")
		shell.CreateFileAndAdd("dir2/leaf-c", "c\n")
		shell.Commit("add three leaves")
	},
	Run: func(t *TestDriver, keys config.KeybindingConfig) {
		t.Views().Commits().
			Focus().
			Lines(Contains("add three leaves").IsSelected()).
			PressEnter()

		t.Views().CommitFiles().
			IsFocused().
			Lines(
				Contains("dir1").IsSelected(),
				Contains("sub1"),
				Contains("leaf-a"),
				Contains("sub2"),
				Contains("leaf-b"),
				Contains("dir2"),
				Contains("leaf-c"),
			).
			NavigateToLine(Contains("leaf-b")).
			Press("-").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("dir2"),
			).
			// opening one directory shows that its subdirectories were collapsed as well
			PressEnter().
			Lines(
				Contains("dir1").IsSelected(),
				Contains("sub1"),
				Contains("sub2"),
				Contains("dir2"),
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
			)
	},
})
