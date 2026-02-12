import { redirect } from 'next/navigation'

export default function CoverageSettingsRedirect() {
  redirect('/settings/system-keys')
}
