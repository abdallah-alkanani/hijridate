# Hijri Date

Hijri Date adds the current Hijri date to the GNOME Shell top panel and provides
a popup Hijri calendar.

## Compatibility

| GNOME Shell | Branch |
| --- | --- |
| 45-50 | `main` |
| 40-44 | `40-44` |

## Features

- Configurable panel position, format, language, numerals, calendar method,
  year display, and date offset.
- Hijri month calendar with month and year selection.
- Separate panel and popup colour controls, with an option to follow the GNOME
  Shell theme.

## Installation

Install the archive that matches the GNOME Shell version in use. The extension
UUID is `hijridate@date`.

## License

This project is licensed under the GNU General Public License, version 3 or
later (`GPL-3.0-or-later`). See [LICENSE](LICENSE).

## Packaging

```sh
gnome-extensions pack --extra-source=popup_menu.css --extra-source=prefs.css
```

`popup_menu.css` is loaded when the popup is first opened, not as the
automatic `stylesheet.css`, so it has to be listed explicitly.
GNOME 40–43 also need the compiled settings schema, which `gnome-extensions
pack` from GNOME 44 and later leaves out. After changing
`schemas/*.gschema.xml`, run `glib-compile-schemas schemas/`, commit
`schemas/gschemas.compiled`, and add it to the zip:

```sh
zip hijridate@date.shell-extension.zip schemas/gschemas.compiled
```
