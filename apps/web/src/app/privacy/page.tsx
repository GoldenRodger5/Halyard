import type { Metadata } from 'next';
import { LegalPage, Section, UPDATED } from '../legal';

export const metadata: Metadata = { title: 'Privacy — Halyard' };

/**
 * Public, unauthenticated, and required by Meta App Review.
 *
 * Every claim here is checked against what the code actually does. Where the
 * system does not do something — read direct messages, sell data, delete
 * automatically on a provider signal — this says so plainly rather than staying
 * silent, because silence in a privacy policy reads as permission.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={UPDATED}>
      <Section title="What Halyard is">
        <p>
          Halyard is a single-operator tool for planning and publishing social content for a
          product. It is operated privately rather than offered as a public service, and it has one
          operator account.
        </p>
      </Section>

      <Section title="What it stores">
        <ul>
          <li>
            <strong>Social account connections.</strong> When you connect an account, Halyard stores
            the handle, display name, avatar URL, follower count and the platform&rsquo;s own account
            identifier.
          </li>
          <li>
            <strong>Access credentials.</strong> Tokens are encrypted with AES-GCM before they are
            written and are never stored in plain text. They are used only to act as the account you
            connected.
          </li>
          <li>
            <strong>Permissions.</strong> The list of permissions the platform reports as granted,
            so Halyard can tell what it is actually allowed to do.
          </li>
          <li>
            <strong>Content you create here.</strong> Drafts, approved posts and their publication
            records.
          </li>
          <li>
            <strong>Public engagement on your own posts.</strong> Metrics, and comments left on
            posts published through Halyard.
          </li>
        </ul>
      </Section>

      <Section title="What it does not do">
        <ul>
          <li>It does not read direct messages.</li>
          <li>It does not send replies, direct messages, follows or any other engagement action.</li>
          <li>It does not sell, rent or share your data with third parties.</li>
          <li>It does not use your data to train models.</li>
          <li>It does not collect data about people who are not you, beyond public comments left on your own posts.</li>
        </ul>
      </Section>

      <Section title="Third parties">
        <p>
          Halyard talks to the social platforms you connect, in order to publish and to read results
          for your own posts. It uses a hosting provider and a managed database to run. It sends
          content to a language-model provider when generating drafts. No data is shared with anyone
          else.
        </p>
      </Section>

      {/*
        §202. Required by the YouTube API Services Developer Policies, and
        absent until now.

        This policy was written for Meta App Review and covered YouTube only by
        accident of generality — the word never appeared. The Developer Policies
        require an API client to disclose its use of YouTube API Services by
        name, link YouTube's Terms and Google's Privacy Policy, say what YouTube
        data it handles, and tell people where to revoke access. A compliance
        audit checks this page, so its absence was a rejection waiting to happen.
      */}
      <Section title="YouTube">
        <p>
          Halyard uses <strong>YouTube API Services</strong> to upload videos to a YouTube channel
          you connect, to read that channel&rsquo;s own public statistics, and to read comments left
          on videos published through Halyard. By connecting a YouTube channel you are also bound by
          the{' '}
          <a className="underline" href="https://www.youtube.com/t/terms" rel="noreferrer">
            YouTube Terms of Service
          </a>
          , and Google&rsquo;s handling of your data is described in the{' '}
          <a
            className="underline"
            href="https://policies.google.com/privacy"
            rel="noreferrer"
          >
            Google Privacy Policy
          </a>
          .
        </p>
        <ul>
          <li>
            <strong>What it accesses.</strong> The connected channel&rsquo;s id, title, handle and
            subscriber count; videos Halyard itself uploaded, and their view, like and comment
            counts; and comment threads on those videos.
          </li>
          <li>
            <strong>What it stores.</strong> The encrypted OAuth credential, the granted permissions,
            the channel identity above, and the metrics and comments it reads. Nothing else.
          </li>
          <li>
            <strong>What it does not do.</strong> It does not read channels you have not connected,
            does not access anyone else&rsquo;s viewing history or watch data, does not post comments
            or replies, and does not share YouTube data with any third party. Video content is never
            sent to a language-model provider.
          </li>
          <li>
            <strong>Uploads are private by default.</strong> Until the compliance audit has passed
            and the operator has marked the channel live, every upload is created with{' '}
            <code>privacyStatus: private</code> and is visible only to the channel owner.
          </li>
        </ul>
        <p>
          You can revoke Halyard&rsquo;s access to your Google account at any time at{' '}
          <a
            className="underline"
            href="https://myaccount.google.com/permissions"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          , which invalidates the stored credential immediately. Disconnecting the account inside
          Halyard erases the stored credential and the YouTube data read with it.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          Connections, content and results are kept until they are deleted. The Accounts screen has
          a <strong>Disconnect</strong> action that erases the stored credential for an account —
          the encrypted access and refresh tokens, the recorded permissions, and everything else
          observed by holding that credential. It leaves the account record and any published
          history in place, so posts that already went out can still say where they came from, and
          it does not revoke the permission at the platform. Access can also be revoked at any time
          from the social platform&rsquo;s own settings, which invalidates the stored credential
          immediately. See{' '}
          <a className="underline" href="/data-deletion">
            data deletion
          </a>{' '}
          for what can be removed and how to ask.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For any question about this policy, or to make a request about your data, contact the
          operator at the address listed in the Meta app configuration for this application.
        </p>
      </Section>
    </LegalPage>
  );
}
