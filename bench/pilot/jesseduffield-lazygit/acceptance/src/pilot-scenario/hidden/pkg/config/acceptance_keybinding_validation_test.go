package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func acceptanceValidate(mutate func(*UserConfig)) error {
	config := GetDefaultConfig()
	mutate(config)
	return config.Validate()
}

func TestAcceptanceKeybindingKeys(t *testing.T) {
	assert.NoError(t, acceptanceValidate(func(*UserConfig) {}), "default config")
	for _, key := range []string{"", "<disabled>", "q", "ä", "<c-c>", "<C-C>", "<f5>", "<s-up>", "<s-down>", "<backtab>", "<a-enter>"} {
		assert.NoError(t, acceptanceValidate(func(c *UserConfig) { c.Keybinding.Universal.Quit = key }), key)
	}
	err := acceptanceValidate(func(c *UserConfig) { c.Keybinding.Universal.Quit = "<foo>" })
	if assert.Error(t, err) {
		assert.Contains(t, err.Error(), "Unrecognized key '<foo>' for keybinding 'Universal.Quit'")
	}
	err = acceptanceValidate(func(c *UserConfig) { c.Keybinding.Files.CommitChanges = "ctrl+x" })
	if assert.Error(t, err) {
		assert.Contains(t, err.Error(), "Unrecognized key 'ctrl+x' for keybinding 'Files.CommitChanges'")
	}
}

func TestAcceptanceJumpToBlock(t *testing.T) {
	err := acceptanceValidate(func(c *UserConfig) { c.Keybinding.Universal.JumpToBlock = []string{"1", "2", "3"} })
	if assert.Error(t, err) {
		assert.Contains(t, err.Error(), "keybinding.universal.jumpToBlock must have 5 elements; found 3")
	}
	err = acceptanceValidate(func(c *UserConfig) { c.Keybinding.Universal.JumpToBlock = []string{"1", "2", "3", "4", "five"} })
	if assert.Error(t, err) {
		assert.Contains(t, err.Error(), "Unrecognized key 'five' for keybinding 'Universal.JumpToBlock[4]'")
	}
	assert.NoError(t, acceptanceValidate(func(c *UserConfig) { c.Keybinding.Universal.JumpToBlock = []string{"a", "b", "c", "d", "e"} }))
}

func TestAcceptanceCustomCommandKeys(t *testing.T) {
	for _, key := range []string{"", "<disabled>", "x", "<c-a>"} {
		assert.NoError(t, acceptanceValidate(func(c *UserConfig) {
			c.CustomCommands = []CustomCommand{{Key: key, Command: "echo hi"}}
		}), key)
	}
	err := acceptanceValidate(func(c *UserConfig) {
		c.CustomCommands = []CustomCommand{{Key: "x", Command: "echo ok"}, {Key: "<nope>", Command: "echo hi"}}
	})
	if assert.Error(t, err) {
		assert.Contains(t, err.Error(), "Unrecognized key '<nope>' for custom command")
	}
}
