/* extension.js — GNOME Shell 40–44 backport */
'use strict';

/* GNOME 40–44: imports.* modules */
const St       = imports.gi.St;
const GObject  = imports.gi.GObject;
const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;
const Gio      = imports.gi.Gio;

const Main       = imports.ui.main;
const PanelMenu  = imports.ui.panelMenu;
const PopupMenu  = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const _ = ExtensionUtils.gettext;

/* ----- SegmentedButtonRow ------------------------------------------------- */

var SegmentedButtonRow = GObject.registerClass(
class SegmentedButtonRow extends PopupMenu.PopupBaseMenuItem {
    _init(title, items, activeIndex, onChange) {
        /* activate:false => row itself doesn’t toggle */
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, { activate: false });

        this._label = new St.Label({
            text: title,
            x_align: Clutter.ActorAlign.START,
        });
        this._label.add_style_class_name('row-title');
        this.add_child(this._label);

        /* match no-hover behavior */
        this.reactive = false;
        this.track_hover = false;
        this.can_focus = false;
        this.add_style_class_name('no-row-hover');

        const box = new St.BoxLayout({
            style_class: 'linked',
            x_expand: false,
        });
        this.add_child(box);

        this._buttons = [];
        items.forEach((txt, idx) => {
            const btn = new St.Button({
                label: txt,
                style_class: 'option-button',
                toggle_mode: true,
                reactive: true,
                can_focus: true,
            });
            btn.track_hover = true;

            if (idx === activeIndex)
                btn.set_checked(true);

            box.add_child(btn);
            this._buttons.push(btn);

            btn.connect('clicked', () => {
                this._buttons.forEach(b => b.set_checked(false));
                btn.set_checked(true);
                onChange(idx);
            });
        });

        this._label.set_y_align(Clutter.ActorAlign.CENTER);
        box.set_y_align(Clutter.ActorAlign.CENTER);
    }

    setSensitive(sensitive) {
        PopupMenu.PopupBaseMenuItem.prototype.setSensitive.call(this, sensitive);
        this._buttons.forEach(btn => {
            btn.reactive = sensitive;
            btn.opacity = sensitive ? 255 : 80;
        });
        this._label.opacity = sensitive ? 255 : 80;
    }
});

/* ----- Enums / labels ----------------------------------------------------- */

const Language = { ENGLISH: 0, ARABIC: 1 };
const NumberLanguage = { ENGLISH: 0, ARABIC: 1 };
const YearSuffixStyle = { AH: 0, HEH: 1 };
const Position = { FAR_LEFT: 0, LEFT: 1, CENTER: 2, RIGHT: 3, FAR_RIGHT: 4 };

const LanguageText = {
    [Language.ENGLISH]: 'English',
    [Language.ARABIC]: 'Arabic',
};
const NumberLanguageText = {
    [NumberLanguage.ENGLISH]: 'English',
    [NumberLanguage.ARABIC]: 'Arabic',
};
const YearSuffixStyleText = {
    [YearSuffixStyle.AH]: 'AH',
    [YearSuffixStyle.HEH]: 'هـ',
};
const PositionText = {
    [Position.FAR_LEFT]: 'Far Left',
    [Position.LEFT]: 'Left',
    [Position.CENTER]: 'Center',
    [Position.RIGHT]: 'Right',
    [Position.FAR_RIGHT]: 'Far Right',
};

const DEFAULT_SPACING = 0;

/* ----- Date helper -------------------------------------------------------- */

function getHijriDate(
    lang = Language.ENGLISH,
    numLng = NumberLanguage.ENGLISH,
    showY = false,
    suff = YearSuffixStyle.AH,
    fmtStr = '{day} {month} {year} {suffix}'
) {
    try {
        const d = new Date();
        const locale = (lang === Language.ARABIC)
            ? 'ar-SA-u-ca-islamic-umalqura'
            : 'en-US-u-ca-islamic-umalqura';
        const numSys = (numLng === NumberLanguage.ARABIC) ? 'arab' : 'latn';

        const parts = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            numberingSystem: numSys,
        }).formatToParts(d);

        const dict = Object.fromEntries(parts
            .filter(p => ['day', 'month', 'year'].includes(p.type))
            .map(p => [p.type, p.value]));

        const yearValue = dict.year;
        let out = fmtStr;

        if (dict.day)
            out = out.replace(/{day}/g, dict.day);
        if (dict.month)
            out = out.replace(/{month}/g, dict.month);

        out = out.replace(/{year}/g, showY ? yearValue : '');
        const suffixText = showY
            ? (suff === YearSuffixStyle.HEH ? ' هـ' : ' AH')
            : '';
        out = out.replace(/{suffix}/g, suffixText);

        /* collapse spacing/punctuation like the 45+ version */
        out = out.replace(/\s+/g, ' ')
                 .replace(/,\s*,+/g, ',')
                 .replace(/,+/g, ', ')
                 .replace(/\s*,\s*/g, ', ')
                 .replace(/^\s+|\s+$|\,+$|\,+\s+$/g, '');

        return out.trim() || '(Hijri Date)';
    } catch (e) {
        logError(e, 'Hijri date build error');
        return '(Hijri Date)';
    }
}

/* ----- Panel button ------------------------------------------------------- */

var HijriDateButton = GObject.registerClass(
class HijriDateButton extends PanelMenu.Button {
    _init(extension) {
        /* For 40–44 the ctor signature is (alignment, name, dontCreateMenu?) */
        PanelMenu.Button.prototype._init.call(this, 0.5, 'Hijri Date');

        this._extension = extension;

        this.box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });

        this.label = new St.Label({
            text: getHijriDate(
                this._extension._language,
                this._extension._numberLanguage,
                this._extension._showYear,
                this._extension._yearSuffixStyle,
                this._extension._dateFormat
            ),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'hijri-date-label',
        });

        this.box.add_child(this.label);
        this.add_child(this.box);

        /* initial color */
        this._updateColor();

        this.add_style_class_name('hijri-date-button');

        /* 40–44: menu.actor is valid */
        this.menu.actor.add_style_class_name('popup-menu-below-panel');
        this.menu.setSourceAlignment(0.5);

        this._addLanguageOptions();
        this._addNumberLanguageOptions();
        this._addPositionOptions();
        this._addShowYearOption();
        this._addYearSuffixStyleOptions();
        this._addSettingsButton();

        this._settingsChangedId = this._extension._settings.connect('changed', (settings, key) => {
            switch (key) {
                case 'position': {
                    const pos = settings.get_int('position');
                    this._extension.setPosition(pos);
                    break;
                }
                case 'spacing': {
                    this._extension._spacing = settings.get_int('spacing');
                    if (this._extension._spacer)
                        this._extension._spacer.set_style(`width: ${this._extension._spacing}px;`);
                    break;
                }
                case 'language':
                    this._extension._language = settings.get_int('language');
                    this._updateDate();
                    break;
                case 'number-language':
                    this._extension._numberLanguage = settings.get_int('number-language');
                    this._updateDate();
                    break;
                case 'show-year':
                    this._extension._showYear = settings.get_boolean('show-year');
                    this._updateDate();
                    this._updateYearSuffixStyleSensitivity();
                    break;
                case 'year-suffix-style':
                    this._extension._yearSuffixStyle = settings.get_int('year-suffix-style');
                    this._updateDate();
                    break;
                case 'date-format':
                    this._extension._dateFormat = settings.get_string('date-format');
                    this._updateDate();
                    break;
                case 'text-color':
                    this._extension._textColor = settings.get_string('text-color');
                    this._updateColor();
                    break;
            }
        });

        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            60,
            () => {
                this._updateDate();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _addLanguageOptions() {
        const langItems = Object.values(LanguageText);
        const langRow = new SegmentedButtonRow(
            _('Language'),
            langItems,
            this._extension._language,
            idx => {
                this._extension._settings.set_int('language', idx);
                this._extension._language = idx;
                this._updateDate();
            }
        );
        this.menu.addMenuItem(langRow);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _addNumberLanguageOptions() {
        const numberItems = Object.values(NumberLanguageText);
        const numberRow = new SegmentedButtonRow(
            _('Number Language'),
            numberItems,
            this._extension._numberLanguage,
            idx => {
                this._extension._settings.set_int('number-language', idx);
                this._extension._numberLanguage = idx;
                this._updateDate();
            }
        );
        this.menu.addMenuItem(numberRow);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _addPositionOptions() {
        const posItems = Object.values(PositionText);
        const posRow = new SegmentedButtonRow(
            _('Position'),
            posItems,
            this._extension._position,
            idx => {
                this._extension._settings.set_int('position', idx);
                this._extension.setPosition(idx);
            }
        );
        this.menu.addMenuItem(posRow);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _addShowYearOption() {
        const showYearItem = new PopupMenu.PopupSwitchMenuItem(
            _('Show Year'),
            this._extension._showYear,
            { activate: false }
        );
        showYearItem.add_style_class_name('no-row-hover');
        showYearItem.reactive = true;
        showYearItem.track_hover = true;
        showYearItem.can_focus = false;

        showYearItem.connect('toggled', item => {
            const val = item.state;
            this._extension._settings.set_boolean('show-year', val);
            this._extension._showYear = val;
            this._updateDate();
            this._updateYearSuffixStyleSensitivity();
        });

        showYearItem.connect('button-press-event', () => {
            showYearItem.state = !showYearItem.state;
            return Clutter.EVENT_STOP;
        });

        this.menu.addMenuItem(showYearItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _addYearSuffixStyleOptions() {
        const yearItems = Object.values(YearSuffixStyleText);
        const yearRow = new SegmentedButtonRow(
            _('Year Suffix Style'),
            yearItems,
            this._extension._yearSuffixStyle,
            idx => {
                this._extension._settings.set_int('year-suffix-style', idx);
                this._extension._yearSuffixStyle = idx;
                this._updateDate();
            }
        );
        this._yearSuffixStyleRow = yearRow;
        this.menu.addMenuItem(yearRow);
        this._updateYearSuffixStyleSensitivity();
    }

    _addSettingsButton() {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('More Settings...'));
        settingsItem.add_style_class_name('settings-button-item');

        settingsItem.connect('activate', () => {
            try {
                /* GNOME 40–44 */
                ExtensionUtils.openPrefs();
            } catch (e) {
                logError(e, 'Failed to open preferences');
            }
            this.menu.close();
        });

        this.menu.addMenuItem(settingsItem);
    }

    _updateYearSuffixStyleSensitivity() {
        if (!this._yearSuffixStyleRow)
            return;

        const enabled = this._extension._showYear;
        this._yearSuffixStyleRow.setSensitive(enabled);
        this._yearSuffixStyleRow._buttons.forEach(
            btn => (btn.opacity = enabled ? 255 : 80)
        );
        this._yearSuffixStyleRow._label.opacity = enabled ? 255 : 80;
    }

    _updateDate() {
        this.label.set_text(
            getHijriDate(
                this._extension._language,
                this._extension._numberLanguage,
                this._extension._showYear,
                this._extension._yearSuffixStyle,
                this._extension._dateFormat
            )
        );
    }

    _updateColor() {
        if (this.label)
            this.label.set_style(`color: ${this._extension._textColor};`);
    }

    destroy() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = 0;
        }
        if (this._settingsChangedId)
            this._extension._settings.disconnect(this._settingsChangedId);

        PanelMenu.Button.prototype.destroy.call(this);
    }
});

/* ----- Extension object (40–44 lifecycle) -------------------------------- */

class Extension40to44 {
    constructor() {
        this._indicator      = null;
        this._position       = Position.LEFT;
        this._spacing        = DEFAULT_SPACING;
        this._language       = Language.ENGLISH;
        this._numberLanguage = NumberLanguage.ENGLISH;
        this._showYear       = false;
        this._yearSuffixStyle= YearSuffixStyle.AH;
        this._dateFormat     = '{day} {month} {year} {suffix}';
        this._textColor      = '#ffffff';
        this._spacer         = null;
        this._settings       = null;
        this._centerTimeout  = 0;
    }

    enable() {
        this._settings = ExtensionUtils.getSettings();

        this._position        = this._settings.get_int('position');
        this._spacing         = this._settings.get_int('spacing');
        this._language        = this._settings.get_int('language');
        this._numberLanguage  = this._settings.get_int('number-language');
        this._showYear        = this._settings.get_boolean('show-year');
        this._yearSuffixStyle = this._settings.get_int('year-suffix-style');
        this._dateFormat      = this._settings.get_string('date-format');
        this._textColor       = this._settings.get_string('text-color');

        if (this._position === Position.CENTER) {
            if (this._centerTimeout) {
                GLib.Source.remove(this._centerTimeout);
                this._centerTimeout = 0;
            }
            /* slight delay so dateMenu is present */
            this._centerTimeout = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 100, () => {
                    this._addToPanel();
                    this._centerTimeout = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        } else {
            this._addToPanel();
        }
    }

    _addToPanel() {
        if (this._indicator)
            this._indicator.destroy();

        this._indicator = new HijriDateButton(this);

        let boxName = this._getBoxPosition(this._position);
        let boxIndex = 0;

        switch (this._position) {
            case Position.FAR_LEFT:
                boxName = 'left';
                boxIndex = 0;
                break;
            case Position.LEFT:
                boxName = 'left';
                boxIndex = -1; /* end of left box */
                break;
            case Position.CENTER: {
                boxName = 'center';
                const centerBox = Main.panel._centerBox;
                const dateMenuIndex = this._findDateMenuIndex(centerBox);
                boxIndex = dateMenuIndex >= 0 ? dateMenuIndex : 0;
                break;
            }
            case Position.RIGHT:
                boxName = 'right';
                boxIndex = 0;
                break;
            case Position.FAR_RIGHT:
                boxName = 'right';
                boxIndex = -1;
                break;
        }

        if (Main.panel.statusArea['hijri-date'])
            Main.panel.statusArea['hijri-date'].destroy();

        Main.panel.addToStatusArea('hijri-date', this._indicator, boxIndex, boxName);
        this._indicator.menu.setSourceAlignment(0.5);

        /* spacer */
        if (this._spacing > 0) {
            if (!this._spacer) {
                this._spacer = new St.Widget({
                    style: `width: ${this._spacing}px;`,
                    reactive: false,
                    track_hover: false,
                    can_focus: false,
                });
            }
            this._addSpacerToPanel(this._spacer);
        }
    }

    setPosition(position) {
        this._position = position;

        if (this._spacer && this._spacer.get_parent())
            this._spacer.get_parent().remove_child(this._spacer);

        this._addToPanel();

        if (this._spacing > 0 && this._spacer)
            this._addSpacerToPanel(this._spacer);
    }

    _addSpacerToPanel(spacer) {
        this._spacer = spacer;

        let box = null;
        switch (this._getBoxPosition(this._position)) {
            case 'left':
                box = Main.panel._leftBox;
                break;
            case 'center':
                box = Main.panel._centerBox;
                break;
            case 'right':
                box = Main.panel._rightBox;
                break;
            default:
                box = Main.panel._leftBox;
        }

        if (box && this._indicator.container) {
            let idx = -1;
            for (let i = 0; i < box.get_n_children(); i++) {
                if (box.get_child_at_index(i) === this._indicator.container) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0)
                box.insert_child_at_index(this._spacer, idx + 1);
        }
    }

    _findDateMenuIndex(centerBox) {
        if (!centerBox)
            return -1;

        for (let i = 0; i < centerBox.get_n_children(); i++) {
            const child = centerBox.get_child_at_index(i);
            if (Main.panel.statusArea.dateMenu &&
                child === Main.panel.statusArea.dateMenu.container)
                return i;
        }
        return -1;
    }

    _getBoxPosition(position) {
        switch (position) {
            case Position.LEFT:
            case Position.FAR_LEFT:
                return 'left';
            case Position.CENTER:
                return 'center';
            case Position.RIGHT:
            case Position.FAR_RIGHT:
                return 'right';
            default:
                return 'left';
        }
    }

    disable() {
        if (this._centerTimeout) {
            GLib.Source.remove(this._centerTimeout);
            this._centerTimeout = 0;
        }

        if (this._spacer) {
            if (this._spacer.get_parent())
                this._spacer.get_parent().remove_child(this._spacer);
            this._spacer.destroy();
            this._spacer = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
    }
}

/* GNOME 40–44 entry points */
function init(meta) {
    /* will use meta.gettext-domain if present; safe if not */
    try { ExtensionUtils.initTranslations(); } catch (e) { }

    return new Extension40to44();
}

