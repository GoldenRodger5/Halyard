import type { Metadata } from 'next';
import { LegalPage, Section, UPDATED } from '../legal';

export const metadata: Metadata = { title: 'Terms — Halyard' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated={UPDATED}>
      <Section title="Who this is for">
        <p>
          Halyard is operated privately by its owner for their own products. It is not offered to
          the public, and there is no sign-up. Access is limited to the operator.
        </p>
      </Section>

      <Section title="Connected accounts">
        <p>
          You may connect only social accounts you own or are authorised to manage. Halyard confirms
          the identity of an account before saving its credential, and refuses to publish to an
          account whose identity has not been confirmed.
        </p>
      </Section>

      <Section title="Publishing">
        <p>
          Nothing is published without a person approving that specific post. There is no automatic
          approval, no scheduled bypass and no bulk approval that carries over to future content. A
          global switch can stop all publishing at once, and it is checked before every publish.
        </p>
      </Section>

      <Section title="Platform rules">
        <p>
          Content published through Halyard remains subject to the rules of the platform it is
          published to. Halyard does not automate replies, direct messages, following or any other
          engagement action, and offers no feature that inflates a metric.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          Halyard is provided as-is, without warranty. It depends on third-party platform APIs which
          can change or become unavailable, and it makes no guarantee that a post will publish, that
          results will be collected, or that a connection will remain valid.
        </p>
      </Section>
    </LegalPage>
  );
}
