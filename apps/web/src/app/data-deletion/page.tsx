import type { Metadata } from 'next';
import { LegalPage, Section, UPDATED } from '../legal';

export const metadata: Metadata = { title: 'Data deletion — Halyard' };

/**
 * Meta requires a data-deletion URL for any app handling platform data.
 *
 * The honest position is stated first: Halyard has **no automated deletion
 * callback**. Claiming one would be the easiest sentence to write here and the
 * one most likely to be false — the repository has no webhook endpoint at all,
 * so nothing could receive such a request.
 */
export default function DataDeletionPage() {
  return (
    <LegalPage title="Data deletion" updated={UPDATED}>
      <Section title="Revoking access immediately">
        <p>
          The fastest way to stop Halyard using an account is to revoke the app&rsquo;s access in the
          social platform&rsquo;s own settings. That invalidates the stored credential straight away,
          without waiting on anyone.
        </p>
        <p>
          Halyard can also disable an account on its Accounts screen, which stops it being used for
          publishing or collection. Note that disabling does <strong>not</strong> itself erase the
          stored credential; the two are separate controls and the distinction is deliberate.
        </p>
        <p>
          To erase it, use <strong>Disconnect</strong> on the same screen. That removes the
          encrypted access and refresh tokens, the recorded permissions and the identity
          confirmation, and discards any credential staged mid-reconnect. It does not revoke the
          permission at the platform, and it does not delete posts that have already been
          published.
        </p>
      </Section>

      <Section title="What can be deleted on request">
        <ul>
          <li>The connected account record — handle, display name, avatar URL, follower count and platform account identifier.</li>
          <li>The encrypted access and refresh credentials.</li>
          <li>The list of permissions the platform reported as granted.</li>
          <li>Drafts and approved content created in Halyard.</li>
          <li>Publication records for posts published through Halyard.</li>
          <li>Metrics and comments collected for those posts.</li>
        </ul>
      </Section>

      <Section title="What cannot be deleted from here">
        <p>
          Halyard cannot delete anything that lives on the social platform itself. A post already
          published stays on that platform until you delete it there, and revoking Halyard&rsquo;s
          access does not remove it. Permissions granted to the app can also be revoked directly in
          the platform&rsquo;s own settings.
        </p>
      </Section>

      <Section title="No automated deletion callback">
        <p>
          Halyard does <strong>not</strong> currently implement an automated data-deletion callback
          endpoint. Requests are handled manually by the operator. This is stated plainly rather
          than implied, because an endpoint that does not exist cannot honour a request sent to it.
        </p>
      </Section>

      <Section title="How to request deletion">
        <p>
          Send a request to the contact address listed in the Meta app configuration for this
          application, naming the account you want removed. Because Halyard is operated privately by
          a single person for their own products, requests are actioned directly rather than through
          a ticketing system.
        </p>
      </Section>
    </LegalPage>
  );
}
