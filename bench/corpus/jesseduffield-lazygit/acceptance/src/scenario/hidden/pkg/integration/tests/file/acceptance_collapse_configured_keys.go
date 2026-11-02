package file

import (
	"github.com/jesseduffield/lazygit/pkg/config"
	. "github.com/jesseduffield/lazygit/pkg/integration/components"
	"gopkg.in/yaml.v3"
)

// Behaviour: the keys are configurable (keybinding.files.collapseAll / expandAll); the defaults no longer apply then.
var AcceptanceCollapseConfiguredKeys = NewIntegrationTest(NewIntegrationTestArgs{
	Description:  "Collapse all and expand all use the configured keys",
	ExtraCmdArgs: []string{},
	Skip:         false,
	SetupConfig: func(config *config.AppConfig) {
		// the same YAML a user writes under `keybinding:` in config.yml
		userKeys := "files:\n  collapseAll: <c-k>\n  expandAll: <c-j>\n"
		if err := yaml.Unmarshal([]byte(userKeys), &config.GetUserConfig().Keybinding); err != nil {
			panic(err)
		}
	},
	SetupRepo: func(shell *Shell) {
		shell.CreateDir("dir1")
		shell.CreateFile("dir1/leaf-a", "a\n")
		shell.CreateDir("dir2")
		shell.CreateFile("dir2/leaf-b", "b\n")
	},
	Run: func(t *TestDriver, keys config.KeybindingConfig) {
		t.Views().Files().
			IsFocused().
			Lines(
				Contains("dir1").IsSelected(),
				Contains("leaf-a"),
				Contains("dir2"),
				Contains("leaf-b"),
			).
			Press("-").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("leaf-a"),
				Contains("dir2"),
				Contains("leaf-b"),
			).
			Press("<c-k>").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("dir2"),
			).
			Press("<c-j>").
			Lines(
				Contains("dir1").IsSelected(),
				Contains("leaf-a"),
				Contains("dir2"),
				Contains("leaf-b"),
			)
	},
})
