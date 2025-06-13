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

/* ── ENUMS ────────────────────────────────────────────── */
const Position = { FAR_LEFT: 0, LEFT: 1, CENTER: 2, RIGHT: 3, FAR_RIGHT: 4 };
const Language = { ENGLISH: 0, ARABIC: 1 };
const NumberLanguage = { ENGLISH: 0, ARABIC: 1 };
const YearSuffixStyle = { AH: 0, HEH: 1 };

const PositionTextRAW = {
    [Position.FAR_LEFT] : 'Far Left',
    [Position.LEFT]     : 'Left',
    [Position.CENTER]   : 'Center',
    [Position.RIGHT]    : 'Right',
    [Position.FAR_RIGHT]: 'Far Right',
};
const LanguageTextRAW = {
    [Language.ENGLISH] : 'English',
    [Language.ARABIC]  : 'Arabic',
};
const NumberLanguageTextRAW = {
    [NumberLanguage.ENGLISH]: 'English',
    [NumberLanguage.ARABIC] : 'Arabic',
};
const YearSuffixStyleTextRAW = {
    [YearSuffixStyle.AH] : 'AH',
    [YearSuffixStyle.HEH]: 'هـ',
};

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
            if (btn.active)
                btn.add_css_class('active');
            else
                btn.remove_css_class('active');
        });
    }
});

const SegmentedRow = class {
    constructor(title, textMap, currentIndex, onChange) {
        this.row = new Adw.ActionRow({ activatable: false, selectable: false });
        this.row.add_css_class('no-row-hover');


        const titleLbl = new Gtk.Label({
            label: title,
            xalign: 0,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            css_classes: ['linked'],
            hexpand: false,
        });
        this.row.add_prefix(box);    
        this.row.add_prefix(titleLbl); 

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

export default class HijriDatePreferences extends ExtensionPreferences {

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
        } catch (_) {
            
        }
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.hijridate');
        this._loadStylesheet();


        const tr = raw =>
            Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, _(v)]));

        const PositionText        = tr(PositionTextRAW);
        const LanguageText        = tr(LanguageTextRAW);
        const NumberLanguageText  = tr(NumberLanguageTextRAW);
        const YearSuffixStyleText = tr(YearSuffixStyleTextRAW);

        
        const page = new Adw.PreferencesPage({ title: _('Hijri Date Settings') });
        window.add(page);


        const general = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(general);
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


        /* ─Date format row─ */

        const fmtRow = new Adw.ActionRow({ activatable: false, selectable: false });
        fmtRow.add_css_class('no-row-hover');


        const fmtLabel = new Gtk.Label({
            label: _('Date Format'),
            xalign: 0,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const vBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });

        const hBox = new Gtk.Box({ spacing: 6 });

        const fmtEntry = new Gtk.Entry({
            text: settings.get_string('date-format'),
            hexpand: true,
        });
        fmtEntry.placeholder_text = _('{day} {month} {year} {suffix}');
        hBox.append(fmtEntry);

        const resetBtn = new Gtk.Button({
            css_classes: ['reset-btn', 'flat'],
            tooltip_text: _('Reset'),
        });

        resetBtn.set_child(Gtk.Image.new_from_icon_name('view-refresh-symbolic'));
        hBox.append(resetBtn);

        vBox.append(hBox);

        const note = new Gtk.Label({
            label: _('Note: When language is Arabic, order of tokens is reversed'),
            halign: Gtk.Align.START,
            wrap: true,
            css_classes: ['format-help-text'],
        });
        vBox.append(note);

        fmtRow.add_prefix(vBox);   
        fmtRow.add_prefix(fmtLabel);

        general.add(fmtRow);
        const commit = txt => settings.set_string('date-format', txt.trim());
        const validate = () => {
            const txt = fmtEntry.text.trim();
            const ok  = /{day}|{month}|{year}|{suffix}/.test(txt);

            if (ok) commit(txt);

            fmtEntry.remove_css_class(ok ? 'error' : 'valid');
            fmtEntry.add_css_class(ok ? 'valid' : 'error');
        };
        fmtEntry.connect('changed', validate);
        validate();

        resetBtn.connect('clicked', () =>
            fmtEntry.text = '{day} {month} {year} {suffix}'
        );     



        
        general.add(new SegmentedRow(
            _('Position'), PositionText,
            settings.get_int('position'),
            idx => settings.set_int('position', idx)
        ).row);

        /* ── Year display ─────────────────────────────── */
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

        const toggleSuffixSensitivity = () => {
            const enabled = settings.get_boolean('show-year');
            yearSuffixRow._buttons.forEach(btn => (btn.sensitive = enabled));
        };
        yearSwitch.connect('notify::active', toggleSuffixSensitivity);
        toggleSuffixSensitivity();
    }
}
