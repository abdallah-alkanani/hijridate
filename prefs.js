'use strict';

/* ── Imports ──────────────────────────────────────────── */
import Adw     from 'gi://Adw';
import Gio     from 'gi://Gio';
import Gtk     from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gdk     from 'gi://Gdk';

import {
    ExtensionPreferences,
    gettext as _
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/* ── ENUMS & TEXT MAPS ────────────────────────────────── */
const Position = { CENTER: 0, RIGHT: 1, FAR_RIGHT: 2, LEFT: 3, FAR_LEFT: 4 };
const PositionText = {
    [Position.CENTER]   : _('Center'),
    [Position.RIGHT]    : _('Right'),
    [Position.FAR_RIGHT]: _('Far Right'),
    [Position.LEFT]     : _('Left'),
    [Position.FAR_LEFT] : _('Far Left'),
};

const Language = { ENGLISH: 0, ARABIC: 1 };
const LanguageText = {
    [Language.ENGLISH]: _('English'),
    [Language.ARABIC] : _('Arabic'),
};

const NumberLanguage = { ENGLISH: 0, ARABIC: 1 };
const NumberLanguageText = {
    [NumberLanguage.ENGLISH]: _('English'),
    [NumberLanguage.ARABIC] : _('Arabic'),
};

const YearSuffixStyle = { AH: 0, HEH: 1 };
const YearSuffixStyleText = {
    [YearSuffixStyle.AH] : _('AH'),
    [YearSuffixStyle.HEH]: _('هـ'),
};

/* ── Shared Mini-Widgets ──────────────────────────────── */
const OptionButton = GObject.registerClass(
class OptionButton extends Gtk.ToggleButton {
    _init(label, active) {
        super._init({
            label,
            active,
            can_focus: true,
            css_classes: ['option-button'],
        });
        if (active) this.add_css_class('active');

        this.connect('toggled', btn => {
            btn.toggleClass('active', btn.active);
        });
    }
});

const SegmentedRow = class {
    constructor(title, textMap, currentIndex, onChange) {
        this.row = new Adw.ActionRow({ activatable: false, selectable: false });
        this.row.add_css_class('no-row-hover');

        /* left label */
        this.row.add_prefix(new Gtk.Label({
            label: title,
            xalign: 0,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        }));

        /* right linked buttons */
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            css_classes: ['linked'],
            hexpand: true,
        });
        this.row.add_suffix(box);

        this._buttons = Object.entries(textMap).map(([key, label]) => {
            const idx = Number(key);
            const btn = new OptionButton(label, idx === currentIndex);
            btn.connect('toggled', () => {
                if (!btn.active) return;
                this._buttons.forEach(b => (b.active = b === btn));
                onChange(idx);
            });
            box.append(btn);
            return btn;
        });
    }
};

/* ── Preferences Window ───────────────────────────────── */
export default class HijriDatePreferences extends ExtensionPreferences {

    /* simple helper: load stylesheet.css if present */
    _loadStylesheet() {
        const cssPath = `${this.dir.get_path()}/stylesheet.css`;
        const provider = new Gtk.CssProvider();
        try {
            provider.load_from_path(cssPath);
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        } catch (e) {
            console.log(`[HijriDatePrefs] could not load ${cssPath}: ${e}`);
        }
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.hijridate');
        this._loadStylesheet();

        const page = new Adw.PreferencesPage({ title: _('Hijri Date Settings') });
        window.add(page);

        /* ── General Settings group ─────────────────────── */
        const general = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(general);

        general.add(new SegmentedRow(
            _('Position'), PositionText,
            settings.get_int('position'),
            idx => settings.set_int('position', idx)
        ).row);

        /* Date-format free-text entry + helper text */
        const fmtBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 10,
            margin_bottom: 10,
        });

        const fmtRow = new Adw.EntryRow({
            title: _('Date Format'),
            text : settings.get_string('date-format'),
            placeholder_text: _('{day} {month} {year} {suffix}'),
        });

        /* quick-insert token buttons */
        const addTokenBtn = (token) => {
            const btn = new Gtk.Button({ label: token, css_classes: ['token-button'] });
            btn.connect('clicked', () => {
                const p = fmtRow.get_position();
                fmtRow.text = fmtRow.text.slice(0, p) + token + fmtRow.text.slice(p);
                fmtRow.set_position(p + token.length);
            });
            fmtRow.add_suffix(btn);
        };
        ['{day}','{month}','{year}','{suffix}'].forEach(addTokenBtn);

        /* reset button */
        const resetBtn = new Gtk.Button({ icon_name: 'edit-undo', tooltip_text: _('Reset') });
        resetBtn.connect('clicked', () => (fmtRow.text = '{day} {month} {year} {suffix}'));
        fmtRow.add_suffix(resetBtn);

        /* live validation & preview */
        const preview = new Gtk.Label({
            halign: Gtk.Align.START,
            wrap: true,
            css_classes: ['format-preview'],
        });
        const validate = () => {
            const txt = fmtRow.text.trim();
            const ok  = /{day}|{month}|{year}|{suffix}/.test(txt);
            settings.set_string('date-format', ok ? txt : settings.get_string('date-format'));
            preview.label = _('Preview: ') + txt;
            fmtRow.toggleClass('error', !ok);
            preview.toggleClass('error-preview', !ok);
            preview.toggleClass('valid-preview', ok);
        };
        fmtRow.connect('changed', validate);
        validate(); // initial

        fmtBox.append(fmtRow);
        fmtBox.append(new Gtk.Label({
            label: _('Tokens: {day} {month} {year} {suffix}\n'
                   + '{suffix} prints “AH/هـ” only when “Show Year” is on.'),
            halign: Gtk.Align.START,
            wrap: true,
            css_classes: ['format-help-text'],
        }));
        fmtBox.append(preview);
        general.add(fmtBox);

        general.add(new SegmentedRow(
            _('Language'), LanguageText,
            settings.get_int('language'),
            idx => settings.set_int('language', idx)
        ).row);

        general.add(new SegmentedRow(
            _('Number Language'), NumberLanguageText,
            settings.get_int('number-language'),
            idx => settings.set_int('number-language', idx)
        ).row);

        /* ── Year Display group ─────────────────────────── */
        const yearGrp = new Adw.PreferencesGroup({ title: _('Year Display') });
        page.add(yearGrp);

        const showYearRow = new Adw.ActionRow({ title: _('Show Year'), activatable: true });
        const yearSwitch  = new Gtk.Switch({
            active: settings.get_boolean('show-year'),
            valign: Gtk.Align.CENTER,
            css_classes: ['year-toggle-switch'],
        });
        showYearRow.add_suffix(yearSwitch);
        settings.bind('show-year', yearSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        yearGrp.add(showYearRow);

        const yearSuffixRow = new SegmentedRow(
            _('Year Suffix Style'), YearSuffixStyleText,
            settings.get_int('year-suffix-style'),
            idx => settings.set_int('year-suffix-style', idx)
        );
        yearGrp.add(yearSuffixRow.row);

        /* enable / disable suffix buttons based on switch */
        const toggleSuffixSensitivity = () => {
            const enabled = settings.get_boolean('show-year');
            yearSuffixRow._buttons.forEach(btn => (btn.sensitive = enabled));
        };
        yearSwitch.connect('notify::active', toggleSuffixSensitivity);
        toggleSuffixSensitivity();
    }
}


