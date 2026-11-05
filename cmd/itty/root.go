package main

import (
	"github.com/spf13/cobra"
)

const rootLong = `itty is a private web terminal for your phone: one person, one tmux session, unlocked with a passkey.

Every command that reads the configuration file finds it the same way, so the
commands work from any directory. The order is the --config flag, then the
ITTY_CONFIG environment variable, then itty.toml in the current directory, then
the configuration file that the installed service uses.`

func newRootCommand() *cobra.Command {
	root := newGroupCommand("itty", "A private web terminal for your phone, unlocked with a passkey")
	root.Long = rootLong
	root.Version = buildVersion()
	root.SilenceUsage = true
	root.SilenceErrors = true
	root.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return usageError{err} })

	root.AddCommand(
		newInstallCommand(),
		newInitCommand(),
		newCheckCommand(),
		newEnrollCommand(),
		newServeCommand(),
		newRenewCertCommand(),
		newConfigCommand(),
		newServiceCommand(),
	)
	root.AddCommand(newServiceShortcuts()...)
	return root
}

func newGroupCommand(use, short string) *cobra.Command {
	return &cobra.Command{
		Use:   use,
		Short: short,
		Args:  usageArgs(cobra.NoArgs),
		RunE:  func(cmd *cobra.Command, _ []string) error { return cmd.Help() },
	}
}
