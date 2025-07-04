'use strict';

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';


const SegmentedButtonRow = GObject.registerClass(
class SegmentedButtonRow extends PopupMenu.PopupBaseMenuItem {
    _init(title, items, activeIndex, onChange) {
        super._init({ activate: false });

        this._label = new St.Label({
            text: title,
            x_align: Clutter.ActorAlign.START
        });
        this._label.add_style_class_name('row-title');
        this.add_child(this._label);


        this.reactive = false;
        this.track_hover = false;
        this.can_focus = false;
        this.add_style_class_name('no-row-hover');

        const box = new St.BoxLayout({
            style_class: 'linked',
            x_expand: false
        });
        this.add_child(box);

        this._buttons = [];
        items.forEach((txt, idx) => {
            const btn = new St.Button({
                label: txt,
                style_class: 'option-button',
                toggle_mode: true,
                reactive: true,
                can_focus: true
            });

            if (idx === activeIndex)
                btn.add_style_pseudo_class('active');

            box.add_child(btn);
            this._buttons.push(btn);

            btn.connect('clicked', () => {
                this._buttons.forEach(b => b.remove_style_pseudo_class('active'));
                btn.add_style_pseudo_class('active');
                onChange(idx);
            });
        });

        this._label.set_y_align(Clutter.ActorAlign.CENTER);
        box.set_y_align(Clutter.ActorAlign.CENTER);
    }

    setSensitive(sensitive) {
        super.setSensitive(sensitive);
        this._buttons.forEach(btn => {
            btn.reactive = sensitive;
            btn.opacity = sensitive ? 255 : 80;
        });
        this._label.opacity = sensitive ? 255 : 80;
    }
});


// Enums and their labels
const Language = {
    ENGLISH: 0,
    ARABIC: 1
};

const NumberLanguage = {
    ENGLISH: 0,
    ARABIC: 1
};

const YearSuffixStyle = {
    AH: 0,
    HEH: 1 // "هـ"
};

const Position = {
    FAR_LEFT: 0,
    LEFT: 1,
    CENTER: 2,
    RIGHT: 3,
    FAR_RIGHT: 4
};

const LanguageText = {
    [Language.ENGLISH]: 'English',
    [Language.ARABIC]: 'Arabic'
};

const NumberLanguageText = {
    [NumberLanguage.ENGLISH]: 'English',
    [NumberLanguage.ARABIC]: 'Arabic'
};

const YearSuffixStyleText = {
    [YearSuffixStyle.AH]: 'AH',
    [YearSuffixStyle.HEH]: 'هـ'
};

const PositionText = {
    [Position.FAR_LEFT]: 'Far Left',
    [Position.LEFT]: 'Left',
    [Position.CENTER]: 'Center',
    [Position.RIGHT]: 'Right',
    [Position.FAR_RIGHT]: 'Far Right'
};

const DEFAULT_SPACING = 0;


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
            numberingSystem: numSys
        }).formatToParts(d);

        const dict = Object.fromEntries(parts
            .filter(p => ['day', 'month', 'year'].includes(p.type))
            .map(p => [p.type, p.value])
        );

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

        // collapse extra spaces/commas
        out = out.replace(/\s+/g, ' ')
                 .replace(/,\s*,+/g, ',')
                 .replace(/,+/g, ', ')
                 .replace(/\s*,\s*/g, ', ')
                 .replace(/^\s+|\s+$|\,+$|\,+\s+$/g, '');

        return out.trim() || '(Hijri Date)';
    } catch (e) {
        console.error('Hijri date build error:', e);
        return '(Hijri Date)';
    }
}

// HijriDateButton: the panel button + popup menu
const HijriDateButton = GObject.registerClass(
class HijriDateButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Hijri Date');
        this._extension = extension;

        this.box = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
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
            style_class: 'hijri-date-label'
        });

        this.box.add_child(this.label);
        this.add_child(this.box);

        if (this._extension._spacing > 0) {
            this._spacer = new St.Widget({
                style: `width: ${this._extension._spacing}px;`,
                reactive: false,
                track_hover: false,
                can_focus: false
            });
            this._extension._addSpacerToPanel(this._spacer);
        }

        this.add_style_class_name('hijri-date-button');
        this.menu.actor.add_style_class_name('popup-menu-below-panel');
        this.menu._arrowAlignment = 0.5;

        this._addLanguageOptions();
        this._addNumberLanguageOptions();
        this._addDateFormatOption();
        this._addPositionOptions();
        this._addShowYearOption();
        this._addYearSuffixStyleOptions();

        this._settingsChangedId = this._extension._settings.connect('changed', (settings, key) => {
            switch (key) {
                case 'position':
                case 'spacing':
                    this._extension.disable();
                    this._extension.enable();
                    break;
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

    _addDateFormatOption() {
        const row = new PopupMenu.PopupBaseMenuItem({ activate: false });
        row.add_style_class_name('no-row-hover');
        row.add_style_class_name('hijri-date-menu-item');

        const vboxRow = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        row.add_child(vboxRow);


        const hboxRow = new St.BoxLayout({ x_expand: true });
        vboxRow.add_child(hboxRow);

        const lbl = new St.Label({
            text: _('Date Format'),
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });
        lbl.add_style_class_name('row-title');
        lbl.set_width(80);
        hboxRow.add_child(lbl);

        const innerBox = new St.BoxLayout({
            style_class: 'linked',
            x_expand: true
        });
        hboxRow.add_child(innerBox);

        const entry = new St.Entry({
            text: this._extension._dateFormat,
            style_class: 'option-entry',
            can_focus: true,
            x_expand: true
        });
        entry.set_y_align(Clutter.ActorAlign.CENTER);
        innerBox.add_child(entry);

        const reset = new St.Button({
            style_class: 'system-menu-action',
            child: new St.Icon({ icon_name: 'view-refresh-symbolic', icon_size: 16 }),
            can_focus: true
        });
        innerBox.add_child(reset);

        const save = txt => {
            this._extension._settings.set_string('date-format', txt);
            this._extension._dateFormat = txt;
            this._updateDate();
        };

        const validate = () => {
            const txt = entry.get_text().trim();
            const ok  = /{day}|{month}|{year}|{suffix}/.test(txt);

            if (ok)         
                save(txt);

            entry.remove_style_class_name(ok ? 'error' : 'valid');
            entry.add_style_class_name(ok ? 'valid' : 'error');
        };


        entry.clutter_text.connect('text-changed', validate);
        validate();          

        reset.connect('clicked', () => {
            entry.set_text('{day} {month} {year} {suffix}');
        });
        const help = new St.Label({
            text: _('Note: When language is Arabic, order of tokens is reversed'),
            style_class: 'format-help-text-popup',
            x_align: Clutter.ActorAlign.START
        });
        help.set_margin_bottom(4);

        const helpRow = new St.BoxLayout({ x_expand: true });
        helpRow.add_child(new St.Label({
            text: '',              
            width: 80          
        }));
        helpRow.add_child(help);
        vboxRow.add_child(helpRow);


        this.menu.addMenuItem(row);
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
                this._extension.disable();
                this._extension.enable();
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

    _updateYearSuffixStyleSensitivity() {
        if (!this._yearSuffixStyleRow) return;
    
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

    destroy() {
        if (this._timer)
            GLib.source_remove(this._timer);
        if (this._settingsChangedId)
            this._extension._settings.disconnect(this._settingsChangedId);
        if (this._spacer)
            this._spacer.destroy();
        super.destroy();
    }
});

export default class HijriDateDisplayExtension extends Extension {
    _indicator      = null;
    _position       = Position.LEFT;
    _spacing        = DEFAULT_SPACING;
    _language       = Language.ENGLISH;
    _numberLanguage = NumberLanguage.ENGLISH;
    _showYear       = false;
    _yearSuffixStyle= YearSuffixStyle.AH;
    _dateFormat     = '{day} {month} {year} {suffix}';
    _spacer         = null;
    _settings       = null;

    constructor(metadata) {
        super(metadata);
    }

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.hijridate');
        this._position       = this._settings.get_int('position');
        this._spacing        = this._settings.get_int('spacing');
        this._language       = this._settings.get_int('language');
        this._numberLanguage = this._settings.get_int('number-language');
        this._showYear       = this._settings.get_boolean('show-year');
        this._yearSuffixStyle= this._settings.get_int('year-suffix-style');
        this._dateFormat     = this._settings.get_string('date-format');
        this._addToPanel();
    }

    _addToPanel() {
        if (this._indicator) {
            this._indicator.destroy();
        }

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
                boxIndex = 1;
                break;
            case Position.CENTER:
                boxName = 'center';
                boxIndex = 0;
                break;
            case Position.RIGHT:
                boxName = 'right';
                boxIndex = 0;
                break;
            case Position.FAR_RIGHT:
                boxName = 'right';
                boxIndex = -1;
                break;
        }

        Main.panel.addToStatusArea('hijri-date', this._indicator, boxIndex, boxName);
        this._indicator.menu._arrowAlignment = 0.5;
    }

    setPosition(position) {
        this._position = position;
        this._addToPanel();
        this._settings.set_int('position', this._position);
        this._settings.set_int('spacing', this._spacing);
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
            if (idx >= 0) {
                box.insert_child_at_index(this._spacer, idx + 1);
            }
        }
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
        if (this._spacer) {
            if (this._spacer.get_parent())
                this._spacer.get_parent().remove_child(this._spacer);
            this._spacer?.destroy();
            this._spacer = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
        console.debug('Hijri Date extension disabled.');
    }
}