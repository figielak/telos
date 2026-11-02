package worktree

import (
	"github.com/jesseduffield/lazygit/pkg/config"
	. "github.com/jesseduffield/lazygit/pkg/integration/components"
)

// Behaviour: fast-forwarding a branch that is checked out in another worktree updates that branch and leaves the
// current worktree without file changes; fast-forwarding a branch that is checked out nowhere, and the current
// branch, keep working.
var AcceptanceFastForwardLinkedWorktree = NewIntegrationTest(NewIntegrationTestArgs{
	Description:  "Fast-forward branches in a linked worktree, in no worktree and in the current worktree",
	ExtraCmdArgs: []string{},
	Skip:         false,
	SetupConfig:  func(config *config.AppConfig) {},
	SetupRepo: func(shell *Shell) {
		shell.NewBranch("main-work")
		shell.CreateFileAndAdd("README.md", "hello world")
		shell.Commit("initial commit")
		shell.EmptyCommit("two")
		// the commit to fast-forward to adds a file, so a fast-forward in the wrong worktree leaves a visible trace
		shell.CreateFileAndAdd("incoming.txt", "arrives with the fast-forward")
		shell.Commit("three")
		shell.NewBranch("linked-work")
		shell.NewBranch("plain-work")

		shell.CloneIntoRemote("origin")
		shell.SetBranchUpstream("main-work", "origin/main-work")
		shell.SetBranchUpstream("linked-work", "origin/linked-work")
		shell.SetBranchUpstream("plain-work", "origin/plain-work")

		// every branch is one commit behind its upstream
		shell.HardReset("HEAD^")
		shell.Checkout("linked-work")
		shell.HardReset("HEAD^")
		shell.Checkout("main-work")
		shell.HardReset("HEAD^")

		shell.AddWorktreeCheckout("linked-work", "../linked-worktree")
	},
	Run: func(t *TestDriver, keys config.KeybindingConfig) {
		noLocalChanges := func() {
			t.Views().Files().
				Focus().
				Press(keys.Files.RefreshFiles).
				LineCount(EqualsInt(0))
		}

		t.Views().Branches().
			Focus().
			NavigateToLine(Contains("linked-work (worktree)")).
			SelectedLine(Contains("↓1")).
			Press(keys.Branches.FastForward).
			SelectedLine(Contains("linked-work (worktree)").Contains("✓"))
		noLocalChanges()

		t.Views().Branches().
			Focus().
			NavigateToLine(Contains("plain-work")).
			SelectedLine(Contains("↓1")).
			Press(keys.Branches.FastForward).
			SelectedLine(Contains("plain-work").Contains("✓"))
		noLocalChanges()

		t.Views().Branches().
			Focus().
			NavigateToLine(Contains("main-work")).
			SelectedLine(Contains("↓1")).
			Press(keys.Branches.FastForward).
			SelectedLine(Contains("main-work").Contains("✓"))
		noLocalChanges()
	},
})
