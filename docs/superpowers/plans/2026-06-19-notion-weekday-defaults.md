# Notion Weekday Defaults Plan

## Goal

Allow each user to configure Notion cards that are automatically attached to new work entries on specific weekdays with fixed hours.

## Decisions

- Store weekday defaults in a separate user-owned table instead of overloading the Notion connection JSON.
- Use `source = weekday_default` for links created by weekday rules.
- Apply weekday defaults before previous-date Notion recommendations.
- Preserve weekday default hours as manual allocations, then split remaining entry hours across previous-date cards through the existing allocation function.
- Exclude `weekday_default` links from future previous-date recommendations.
- Configure weekday defaults in a separate `요일별 자동 카드` popup instead of embedding them in the Notion connection popup.
- Let one popup row select multiple weekdays for the same card and hour value, while storing expanded weekday-specific rules.
- Show a lightweight skeleton while automatic Notion recommendation is being fetched.

## Implementation Checklist

- [x] Add domain source type for `weekday_default`.
- [x] Add DB schema and store functions for weekday defaults.
- [x] Add separate Notion card settings popup for weekday defaults.
- [x] Replace one-weekday dropdown with multi-weekday buttons per default row.
- [x] Combine weekday defaults and previous-date recommendations in the timesheet server action.
- [x] Preserve fixed weekday hours during allocation.
- [x] Exclude weekday defaults from previous-date lookup.
- [x] Add recommendation loading skeleton.
- [x] Update architecture, workflow, and SQL reference docs.
