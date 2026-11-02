package hosting_service_test

import (
	"testing"

	"github.com/jesseduffield/lazygit/pkg/commands/hosting_service"
	"github.com/jesseduffield/lazygit/pkg/fakes"
	"github.com/jesseduffield/lazygit/pkg/i18n"
	"github.com/stretchr/testify/assert"
)

// Public behaviour only: the manager, a remote URL, the configured service domains and the resulting pull request URL.
func TestAcceptanceAzureDevOpsServerPullRequestURL(t *testing.T) {
	domains := map[string]string{"devops.example.org": "azuredevops:devops.example.org"}
	scenarios := []struct {
		name      string
		remoteURL string
		domains   map[string]string
		from      string
		to        string
		expected  string
	}{
		{
			name:      "self-hosted server, https remote",
			remoteURL: "https://devops.example.org/collection/myproject/_git/myrepo",
			domains:   domains,
			from:      "feature/new",
			expected:  "https://devops.example.org/collection/myproject/_git/myrepo/pullrequestcreate?sourceRef=feature%2Fnew",
		},
		{
			name:      "self-hosted server, https remote with .git suffix and a target branch",
			remoteURL: "https://devops.example.org/collection/myproject/_git/myrepo.git",
			domains:   domains,
			from:      "feature/new",
			to:        "dev",
			expected:  "https://devops.example.org/collection/myproject/_git/myrepo/pullrequestcreate?sourceRef=feature%2Fnew&targetRef=dev",
		},
		{
			name:      "another collection and repository on the same server",
			remoteURL: "https://devops.example.org/teamsite/billing/_git/invoices",
			domains:   domains,
			from:      "fix-1",
			expected:  "https://devops.example.org/teamsite/billing/_git/invoices/pullrequestcreate?sourceRef=fix-1",
		},
		{
			name:      "cloud Azure DevOps keeps working",
			remoteURL: "https://myorg@dev.azure.com/myorg/myproject/_git/myrepo",
			from:      "feature/new",
			expected:  "https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequestcreate?sourceRef=feature%2Fnew",
		},
	}

	for _, s := range scenarios {
		t.Run(s.name, func(t *testing.T) {
			log := &fakes.FakeFieldLogger{}
			mgr := hosting_service.NewHostingServiceMgr(log, i18n.EnglishTranslationSet(), s.remoteURL, s.domains)
			url, err := mgr.GetPullRequestURL(s.from, s.to)
			assert.NoError(t, err)
			assert.Equal(t, s.expected, url)
			log.AssertErrors(t, nil)
		})
	}
}

func TestAcceptanceUnconfiguredHostIsStillRejected(t *testing.T) {
	log := &fakes.FakeFieldLogger{}
	mgr := hosting_service.NewHostingServiceMgr(log, i18n.EnglishTranslationSet(), "https://devops.example.org/collection/myproject/_git/myrepo", nil)
	_, err := mgr.GetPullRequestURL("feature/new", "")
	assert.Error(t, err)
}
