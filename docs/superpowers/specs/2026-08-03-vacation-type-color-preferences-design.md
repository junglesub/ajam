# Vacation Type Color Preferences Design

## Context

Vacation colors are currently assigned from six tones after grouping the selected year's records by normalized vacation name and sorting the groups by used hours. A type can therefore change color when its usage rank changes. The app already defines light and dark values for those six tones.

## Data Model

Add `VacationTypeColorPreference`, keyed by `userId` and normalized vacation type `name`. Store one `color` string:

- Presets: `blue`, `amber`, `emerald`, `rose`, `violet`, or `cyan`.
- Custom colors: lowercase six-digit hex such as `#3b82f6`.

Preferences apply to the same user and normalized vacation name across every year. Deleting a preference restores the existing automatic tone assignment. Renaming a vacation type does not migrate its color preference automatically.

Add the Prisma model, runtime table/index creation, a focused DB store, and a reference migration document. Do not introduce a separate vacation-type entity or JSON settings field.

## Domain And Data Flow

Expose the preset list and color validation as domain utilities so the server boundary and UI share one definition. Extend vacation grouping to accept an optional name-to-color preference map. A saved preference overrides the automatic tone; types without a preference continue using the existing rank-based fallback.

`loadVacationYearAction` returns the current user's preferences with the year data. A new server action validates the normalized name and color, then upserts the preference or deletes it for automatic mode. It returns refreshed year data so the current calendar and summary update through the existing `applyVacationYearData` path.

## UI

In the vacation summary's “휴가 유형” section, make each color swatch an accessible button. Clicking it expands a compact editor for that row containing:

- Six existing preset swatches.
- Native `<input type="color">` for a custom value.
- `자동 배정` to remove the saved preference.
- Saving and error feedback.

Only one row editor is open at a time. The current visible color updates after a successful server response; a failed save keeps the previous color and displays the error in the editor.

### Compact Color Controls

Replace the text-heavy custom and automatic controls with color circles:

- Custom color is a rainbow-gradient circle with a centered pencil icon. It labels and opens a visually hidden native `<input type="color">`; choosing a color saves it immediately, so there is no separate apply button.
- Automatic assignment is a circle filled with the actual automatic preset color for that vacation group's current rank and a centered `A`. Clicking it removes the preference.
- Both circles expose Korean accessible names and `aria-pressed` selection state. Preset color circles retain their existing labels and selection state.
- The automatic preview is calculated from the existing preset order and group index in the summary. It does not add another stored value or change the automatic assignment algorithm.

## Light And Dark Themes

Preset colors continue using the existing Tailwind classes and `data-vacation-tone` dark overrides.

Custom colors are stored once as the user's raw hex. Calendar fills and summary swatches set that value as `--vacation-custom-color` and use a shared CSS class:

- Light theme mixes the custom color with white to create a readable tint behind dark date text.
- Dark theme mixes it with `#1f1f1f` to create a readable tint behind light date text.
- Use `color-mix(in oklab, ...)` so hue is preserved while theme-specific lightness is derived at render time.

Do not store derived theme colors. Theme changes recalculate the rendered color automatically.

## Validation And Errors

The server accepts only the six preset IDs, a six-digit hex color, or `null` for automatic mode. It normalizes hex to lowercase and rejects blank vacation names. Database uniqueness guarantees one preference per user and normalized name.

## Documentation And Verification

Update the product brief, architecture, decisions, and add a reference migration SQL file. Add focused domain and DB tests for preference override, fallback, validation, upsert, and delete. Run all available tests, lint, and typechecks. Do not run a production build unless the user asks for it.
