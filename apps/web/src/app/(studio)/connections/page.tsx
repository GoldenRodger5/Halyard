/**
 * §497. The name an operator types.
 *
 * Connections live in Master Control, at `/master`. Somebody looking for them
 * types the word, so both obvious guesses land there rather than on a 404.
 */
import { redirect } from 'next/navigation';

export default function Redirect(): never {
  redirect('/master');
}
