# Google sign-in

**Status:** the app side is done (§390). What remains is configuration in two
consoles — Google Cloud and Supabase — because an OAuth client belongs to a
project, not to a repository.

---

## What the code does

`SignInForm` calls `supabase.auth.signInWithOAuth({ provider: 'google' })`.
Nothing else changed, and that is the point:

- Google returns to **Supabase's** callback, not ours.
- Supabase then redirects to `/api/auth/callback` with `?code=`.
- That route has exchanged a PKCE code for a session since Milestone 48, so it
  handles Google with no new code at all.
- **The allow-list is unchanged.** `admin_users` is still the gate. A Google
  account that signs in successfully is signed straight back out unless it is
  on the list. Signing in with Google proves an address; it does not make
  anybody an operator.

`prompt: 'select_account'` is passed deliberately. Without it Google reuses
whichever account the browser is already signed into, which is the same failure
the account-confirmation step exists for on the publishing side — a consent
screen authorises whoever is already there, without ever asking.

---

## 0. Use the stable URL, not the deployment URL

`vercel --prod` prints an **immutable** URL — `halyard-1tokfh97i-….vercel.app` —
which is different for every deploy. It can never be on an OAuth allow-list,
because the list would be stale the next time anything ships.

The production alias is stable and is the one to configure everywhere:

```
https://halyard-ten.vercel.app
```

(`vercel inspect <deployment>` lists the aliases.)

## 1. Google Cloud Console

The OAuth client already exists — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are in `.env`. It needs one **authorised redirect URI**, and it must be
Supabase's, not Halyard's:

```
https://yyeslynjoqhqcdlzpevq.supabase.co/auth/v1/callback
```

*APIs & Services → Credentials → your OAuth 2.0 Client ID → Authorised redirect
URIs → Add.*

Also add, under **Authorised JavaScript origins**, wherever the app is served:

```
http://localhost:3200
https://halyard-ten.vercel.app
```

A redirect URI pointing at Halyard rather than Supabase is the usual mistake
here, and it fails with `redirect_uri_mismatch`.

## 2. Supabase dashboard

*Authentication → Providers → Google → Enable*, then paste:

| Field | Value |
|---|---|
| Client ID | the value of `GOOGLE_CLIENT_ID` in `.env` |
| Client Secret | the value of `GOOGLE_CLIENT_SECRET` in `.env` |

Then *Authentication → URL Configuration*:

| Field | Value |
|---|---|
| Site URL | `https://halyard-ten.vercel.app` |
| Redirect URLs | `http://localhost:3200/api/auth/callback` **and** `https://halyard-ten.vercel.app/api/auth/callback` |

Supabase refuses a redirect that is not on that list, silently returning to the
site URL — so a sign-in that appears to work and lands you signed out is almost
always a missing entry here.

## 3. The allow-list

The **first** account to sign in claims the instance when `admin_users` is
empty (Milestone 48). After that, adding an operator is a row:

```sql
insert into admin_users (user_id, email)
values ('<supabase auth user id>', '<email>');
```

The user id is in *Authentication → Users* in the Supabase dashboard.

---

## What each failure means

The message tells you which of the three steps is missing:

| What you see | What is missing |
|---|---|
| `redirect_uri_mismatch` from Google | Step 1 — the Supabase callback is not in the Google client's redirect URIs |
| `Unsupported provider: provider is not enabled` | Step 2 — Google is not enabled in Supabase |
| Google succeeds, you land back on `/signin` signed out | Step 2 — the app's `/api/auth/callback` is not in Supabase's Redirect URLs |
| *"That address is not on the allow-list for this instance."* | Step 3 — the account is not in `admin_users`. This one is the app working correctly |
| A Vercel login wall before you reach the page | Deployment protection, not auth. Open it while signed into Vercel, or turn protection off for this project |

## Checking it

1. `/signin` shows **Continue with Google** above the password form.
2. Clicking it leaves for Google's account chooser.
3. Returning lands on `/` signed in — or back on `/signin` with a message, which
   is what an address off the allow-list is supposed to get.
