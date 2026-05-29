# n8n Daily Timesheet Reminder

## Goal

퇴근시간에 n8n이 aJam 내부 API를 호출해 당일 업무 기록을 작성하지 않은 사용자를 조회하고, 이메일 리마인더를 보낸 뒤 발송 기록을 aJam에 남긴다.

## aJam Setup

Set the same secret token in aJam and n8n.

```env
AJAM_INTERNAL_API_TOKEN="change-this-token-for-n8n"
```

The API uses the `Asia/Seoul` date when `dateKey` is omitted.

## User Email

- `User.email` stores the reminder destination.
- Empty email users are excluded from reminders.
- The settings modal lets users update their own email.
- Admins can set an email when creating users and can see each user's configured email.

## API

### List Reminder Targets

```http
POST /api/internal/reminders/daily-timesheet
Authorization: Bearer ${AJAM_INTERNAL_API_TOKEN}
Content-Type: application/json

{
  "action": "list"
}
```

Optional fields:

- `dateKey`: `YYYY-MM-DD`; defaults to today's date in `Asia/Seoul`.
- `includeAlreadySent`: set `true` to include users already logged as reminded for the date.

Response:

```json
{
  "ok": true,
  "dateKey": "2026-05-29",
  "targets": [
    {
      "dateKey": "2026-05-29",
      "email": "person@example.com",
      "userId": "user-id",
      "username": "person"
    }
  ]
}
```

If the target date is a weekend or holiday, `targets` is empty and `skippedReason` is returned.

### Mark Email Sent

Call this after n8n sends the email successfully.

```http
POST /api/internal/reminders/daily-timesheet
Authorization: Bearer ${AJAM_INTERNAL_API_TOKEN}
Content-Type: application/json

{
  "action": "mark-sent",
  "dateKey": "2026-05-29",
  "email": "person@example.com",
  "userId": "user-id"
}
```

`ReminderLog` enforces one daily reminder log per user/date/type and is used to avoid duplicate sends.

## Missing Criteria

A user is a reminder target when all of these are true:

- The user has a non-empty email.
- The target date is not a weekend.
- The target date is not a cached or fetched public holiday.
- The user has not already been logged as reminded for that date.
- The user has no work entry with non-empty content for that date.
- Vacation-only and holiday-entry dates are treated as not missing.

## n8n Workflow

Use the custom node package documented in [n8n-custom-node.md](./n8n-custom-node.md). The workflow shape is:

1. Schedule Trigger
2. `aJam > Daily Reminder > List Missing Timesheet Users`
3. Email Send
4. `aJam > Daily Reminder > Mark Reminder Sent`

Configure:

- `aJam API` credential `Base URL`: base URL of the deployed aJam app, for example `https://ajam.example.com`.
- `aJam API` credential `Internal API Token`: same token configured as `AJAM_INTERNAL_API_TOKEN` in aJam.
- SMTP credentials on the `Send Reminder Email` node.

The default schedule is every weekday at 18:00. Adjust it to the actual office closing time in n8n.
