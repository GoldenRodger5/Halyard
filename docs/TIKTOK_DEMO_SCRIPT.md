# TikTok demo video — script

One video, 30–120 seconds, MP4, under 50 MB, showing the real integration.

**Prerequisite that cannot be skipped:** a real TikTok account must be connected to
Halyard first (checklist step 6). The video must show the actual authorization screen
and the actual result. Do not stage either.

---

## Sequence

| # | Action | What it demonstrates |
|---|---|---|
| 1 | Open `https://halyard-ten.vercel.app`, sign in | The real product, on the submitted domain |
| 2 | Land on the dashboard | A working management platform, not a single-purpose uploader |
| 3 | Click **Accounts** in the sidebar | Where accounts are managed |
| 4 | On the TikTok card, click **Connect** | Login Kit entry point |
| 5 | TikTok's authorization screen appears; approve | The real Login Kit flow — never staged |
| 6 | Return to Halyard's confirmation screen | Halyard shows which account was authorized and asks the user to confirm |
| 7 | Confirm; TikTok card now shows connected with the account identity | Identity persistence |
| 8 | Open **Content**, pick a video item bound for TikTok | Content the user prepared |
| 9 | Scroll to **TikTok posting settings** | The Direct Post panel, built from `creator_info` |
| 10 | Point at the creator name and the duration limit | `creator_info` drives the UI |
| 11 | Choose a privacy level | Nothing was pre-selected |
| 12 | Toggle comments on; show a disabled control if the account has one off | Interaction settings respect the account |
| 13 | Turn on commercial disclosure, pick a kind, turn it back off | Disclosure is available and off by default |
| 14 | Show the video preview and the caption field | Preview and review before posting |
| 15 | Tick the **Music Usage Confirmation** | Required consent |
| 16 | Click **Save TikTok settings** — badge flips to "Ready to post" | Validation is real |
| 17 | Click **Approve** | Explicit per-post authorization |
| 18 | Show the item's status moving to processing, then published | `status/fetch` polling, not an assumed success |

## Recording notes

- Full-screen browser, one tab, no other tabs visible.
- Sign in before recording, or blur the password field.
- Do not show `.env`, the developer portal, or any token.
- Use a real video short enough to finish processing inside the recording.

## Encoding

```
ffmpeg -i raw.mov -vf "scale=1280:-2" -c:v libx264 -crf 26 -preset slow \
  -pix_fmt yuv420p -an docs/tiktok-review/halyard-tiktok-demo.mp4
```

Check the result is under 50 MB. Drop `-an` if narration is included.

## Why this is not pre-recorded

Steps 5–7 need a real TikTok authorization, and steps 17–18 need a real Direct Post.
Neither can happen until `video.publish` is granted and an account is connected.
Recording a staged version would be fabricating evidence of an integration that has not
run, which is both dishonest and the fastest way to fail review.
