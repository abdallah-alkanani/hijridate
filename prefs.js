/* prefs.js — GNOME Shell 40–44 backport */
'use strict';



const Gtk     = imports.gi.Gtk;
const Gio     = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gdk     = imports.gi.Gdk;

const Config  = imports.misc.config;
const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

let Adw = null;
if (SHELL_MAJOR >= 42) {
    Adw = imports.gi.Adw;
}

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Me = ExtensionUtils.getCurrentExtension();

/* Bind gettext to our domain early; works reliably on GNOME 40–44 */
const _ = Gettext.domain(Me.metadata['gettext-domain']).gettext;




/* ── ENUMS ────────────────────────────────────────────── */
const Position = { FAR_LEFT: 0, LEFT: 1, CENTER: 2, RIGHT: 3, FAR_RIGHT: 4 };
const CenterPosition = { LEFT: 0, MIDDLE_LEFT: 1, RIGHT: 2, MIDDLE_RIGHT: 3 };
const Language = { ENGLISH: 0, ARABIC: 1 };
const NumberLanguage = { ENGLISH: 0, ARABIC: 1 };
const CalendarMethod = { UMM_AL_QURA: 0, CIVIL: 1, TABULAR: 2, ISLAMIC: 3, RGSA: 4 };
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
const CalendarMethodTextRAW = {
    [CalendarMethod.UMM_AL_QURA]: 'Umm al-Qura (Saudi)',
    [CalendarMethod.CIVIL]      : 'Islamic (civil)',
    [CalendarMethod.TABULAR]    : 'Islamic (tabular)',
    [CalendarMethod.ISLAMIC]    : 'Islamic (observational)',
    [CalendarMethod.RGSA]       : 'Islamic (Saudi, regional)',
};
const YearSuffixStyleTextRAW = {
    [YearSuffixStyle.AH] : 'AH',
    [YearSuffixStyle.HEH]: 'هـ',
};

/* ── Widgets ──────────────────────────────────────────── */

const OptionButton = GObject.registerClass(
class OptionButtonClass extends Gtk.ToggleButton {
    _init(label, active) {
        // GNOME 40 compatibility requires the legacy GObject initializer.
        // eslint-disable-next-line no-restricted-syntax
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

/* Continuous Color Wheel Picker (GTK4) */
const ColorWheel = GObject.registerClass(
class ColorWheelClass extends Gtk.DrawingArea {
    _init(initialColor, onChange) {
        // GNOME 40 compatibility requires the legacy GObject initializer.
        // eslint-disable-next-line no-restricted-syntax
        super._init({
            width_request: 200,
            height_request: 200,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        _setAccessibleName(this, _('Text color'));
        this.onChange = onChange;
        this.currentColor = initialColor || '#ffffff';
        this._isDragging = false;

        const hsv = this._hexToHsv(this.currentColor);
        this.hue = hsv.h;
        this.saturation = hsv.s;
        this.value = hsv.v;

        this.set_draw_func(this._draw.bind(this));

        const motionController = new Gtk.EventControllerMotion();
        motionController.connect('motion', (controller, x, y) => {
            if (this._isDragging)
                this._updateColorFromPosition(x, y);
        });
        this.add_controller(motionController);

        const dragGesture = new Gtk.GestureDrag();
        dragGesture.connect('drag-begin', (gesture, x, y) => {
            this._isDragging = true;
            this._updateColorFromPosition(x, y);
        });
        dragGesture.connect('drag-end', () => {
            this._isDragging = false;
        });
        this.add_controller(dragGesture);

        const clickGesture = new Gtk.GestureClick();
        clickGesture.connect('pressed', this._onPressed.bind(this));
        this.add_controller(clickGesture);
    }

    _draw(area, cr, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 8;

        for (let angle = 0; angle < 360; angle += 2) {
            for (let r = 0; r < radius; r += 3) {
                const sat = r / radius;
                const rgb = this._hsvToRgb(angle, sat, this.value);
                cr.setSourceRGBA(rgb.r / 255, rgb.g / 255, rgb.b / 255, 1);

                const x = centerX + Math.cos((angle - 90) * Math.PI / 180) * r;
                const y = centerY + Math.sin((angle - 90) * Math.PI / 180) * r;

                cr.arc(x, y, 2, 0, 2 * Math.PI);
                cr.fill();
            }
        }

        const a = (this.hue - 90) * Math.PI / 180;
        const dist = this.saturation * radius;
        const selX = centerX + Math.cos(a) * dist;
        const selY = centerY + Math.sin(a) * dist;

        cr.setSourceRGBA(1, 1, 1, 1);
        cr.arc(selX, selY, 6, 0, 2 * Math.PI);
        cr.fill();

        const rgb = this._hsvToRgb(this.hue, this.saturation, this.value);
        cr.setSourceRGB(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        cr.arc(selX, selY, 4, 0, 2 * Math.PI);
        cr.fill();
    }

    _onPressed(gesture, nPress, x, y) {
        this._updateColorFromPosition(x, y);
    }

    _updateColorFromPosition(x, y) {
        const allocation = this.get_allocation();
        const centerX = allocation.width / 2;
        const centerY = allocation.height / 2;
        const radius = Math.min(allocation.width, allocation.height) / 2 - 8;

        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
            let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            if (angle < 0) angle += 360;

            this.hue = angle;
            this.saturation = Math.min(distance / radius, 1);

            const hex = this._hsvToHex(this.hue, this.saturation, this.value);
            this.currentColor = hex;
            this.onChange(hex);
            this.queue_draw();
        }
    }

    setValue(v) {
        this.value = v;
        const hex = this._hsvToHex(this.hue, this.saturation, this.value);
        this.currentColor = hex;
        this.onChange(hex);
        this.queue_draw();
    }

    setColor(hex) {
        const hsv = this._hexToHsv(hex);
        this.hue = hsv.h;
        this.saturation = hsv.s;
        this.value = hsv.v;
        this.currentColor = hex;
        this.queue_draw();
    }

    _hsvToRgb(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;

        let r, g, b;
        if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
        else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
        else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
        else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
        else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
        else [r, g, b] = [c, 0, x];

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255),
        };
    }

    _hexToHsv(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;

        let h = 0;
        if (diff !== 0) {
            if (max === r) h = ((g - b) / diff) % 6;
            else if (max === g) h = (b - r) / diff + 2;
            else h = (r - g) / diff + 4;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;

        const s = max === 0 ? 0 : diff / max;
        const v = max;

        return { h, s, v };
    }

    _hsvToHex(h, s, v) {
        const rgb = this._hsvToRgb(h, s, v);
        return `#${((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1)}`;
    }
});

/* Segmented row that works with/without Adw */
const SegmentedRow = class {
    constructor(title, textMap, currentIndex, onChange, subtitle = '') {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            css_classes: ['linked'],
            homogeneous: true,
            halign: Gtk.Align.END,
        });

        if (Adw) {
            this.row = new Adw.ActionRow({ title, activatable: false, selectable: false });
            this.row.add_css_class('no-row-hover');
            if (subtitle) {
                const grid = new Gtk.Grid({
                    column_spacing: 24,
                    row_spacing: 2,
                    hexpand: true,
                });
                grid.attach(new Gtk.Label({
                    label: title,
                    xalign: 0,
                    halign: Gtk.Align.START,
                    valign: Gtk.Align.CENTER,
                }), 0, 0, 1, 1);
                box.hexpand = true;
                box.halign = Gtk.Align.FILL;
                grid.attach(box, 1, 0, 1, 1);
                grid.attach(new Gtk.Label({
                    label: subtitle,
                    xalign: 0,
                    halign: Gtk.Align.FILL,
                    hexpand: true,
                    wrap: true,
                    max_width_chars: 80,
                    css_classes: ['format-help-text'],
                }), 1, 1, 1, 1);
                this.row.title = '';
                this.row.add_prefix(grid);
            } else {
                this.row.add_suffix(box);
            }
        } else {
            this.row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                hexpand: true,
            });
            this.row.append(new Gtk.Label({
                label: title,
                xalign: 0,
                halign: Gtk.Align.START,
                hexpand: true,
            }));
            if (subtitle) {
                const contentBox = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 2,
                    hexpand: true,
                });
                box.hexpand = true;
                box.halign = Gtk.Align.FILL;
                contentBox.append(box);
                contentBox.append(new Gtk.Label({
                    label: subtitle,
                    xalign: 0,
                    halign: Gtk.Align.FILL,
                    hexpand: true,
                    wrap: true,
                    max_width_chars: 80,
                    css_classes: ['format-help-text'],
                }));
                this.row.append(contentBox);
            } else {
                this.row.append(box);
            }
        }

        this._buttons = Object.entries(textMap).map(([key, label]) => {
            const idx = Number(key);
            const btn = new OptionButton(label, idx === currentIndex);
            btn.connect('clicked', () => {
                this._buttons.forEach(b => (b.active = b === btn));
                onChange(idx);
            });
            box.append(btn);
            return btn;
        });
    }
};

/* ── Helpers ──────────────────────────────────────────── */

function _loadStylesheet() {
    const dir = ExtensionUtils.getCurrentExtension().path;
    const cssPath = `${dir}/prefs.css`;
    const provider = new Gtk.CssProvider();
    provider.load_from_path(cssPath);
    Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
}

let _styleSignal = 0;
function _applyColorSchemeClass(window) {
    const sm = Adw.StyleManager.get_default();

    const apply = () => {
        window.remove_css_class('is-dark');
        window.remove_css_class('is-light');
        window.add_css_class(sm.dark ? 'is-dark' : 'is-light');
    };

    apply();

    if (_styleSignal)
        sm.disconnect(_styleSignal);
    _styleSignal = sm.connect('notify::dark', apply);

    window.connect('close-request', () => {
        if (_styleSignal) {
            sm.disconnect(_styleSignal);
            _styleSignal = 0;
        }
        return false;
    });
}

function _tr(raw) {
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, _(v)]));
}

function _setAccessibleName(widget, name) {
    if (!widget || !name)
        return;

    if (typeof widget.set_accessible_name === 'function')
        widget.set_accessible_name(name);
}

function _buildSharedUI(container, settings, mode = 'all') {
    const hasCenterPosition = settings.settings_schema.has_key('center-position');
    const includeGeneral = mode !== 'appearance';
    const includeAppearance = mode !== 'general';

    /* Language group */
    const PositionText        = _tr(PositionTextRAW);
    const LanguageText        = _tr(LanguageTextRAW);
    const NumberLanguageText  = _tr(NumberLanguageTextRAW);
    const CalendarMethodText  = _tr(CalendarMethodTextRAW);
    const YearSuffixStyleText = _tr(YearSuffixStyleTextRAW);

    const groupAdd = (title) => {
        if (Adw) {
            const g = new Adw.PreferencesGroup({ title });
            container.add(g);
            return g;
        } else {
            const frame = new Gtk.Frame({ label: title, hexpand: true });
            frame.set_child(new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_top: 6, margin_bottom: 6, margin_start: 6, margin_end: 6 }));
            container.add(frame);
            return {
                add: w => frame.get_child().append(w),
            };
        }
    };

    if (includeGeneral) {
        /* Language */
        const languageGroup = groupAdd(_('Language'));
        languageGroup.add(new SegmentedRow(
            _('Language'), LanguageText,
            settings.get_int('language'),
            idx => settings.set_int('language', idx)
        ).row);

        languageGroup.add(new SegmentedRow(
            _('Week Language'), LanguageText,
            settings.get_int('week-language'),
            idx => settings.set_int('week-language', idx)
        ).row);

        languageGroup.add(new SegmentedRow(
            _('Number Language'), NumberLanguageText,
            settings.get_int('number-language'),
            idx => settings.set_int('number-language', idx)
        ).row);

        if (Adw) {
            const calendarMethodList = new Gtk.StringList();
            [
                CalendarMethodText[CalendarMethod.UMM_AL_QURA],
                CalendarMethodText[CalendarMethod.CIVIL],
                CalendarMethodText[CalendarMethod.TABULAR],
                CalendarMethodText[CalendarMethod.ISLAMIC],
                CalendarMethodText[CalendarMethod.RGSA],
            ].forEach(label => calendarMethodList.append(label));

            const calendarMethodRow = new Adw.ComboRow({
                title: _('Calendar Method'),
                subtitle: _('Choose how Hijri months are calculated'),
                model: calendarMethodList,
                selected: settings.get_int('calendar-method'),
            });
            calendarMethodRow.connect('notify::selected', () => {
                settings.set_int('calendar-method', calendarMethodRow.selected);
            });
            languageGroup.add(calendarMethodRow);
        } else {
            const calRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                hexpand: true,
            });
            calRow.append(new Gtk.Label({
                label: _('Calendar Method'),
                xalign: 0,
                hexpand: true,
            }));

            const calCombo = new Gtk.ComboBoxText({ halign: Gtk.Align.END });
            [
                CalendarMethodText[CalendarMethod.UMM_AL_QURA],
                CalendarMethodText[CalendarMethod.CIVIL],
                CalendarMethodText[CalendarMethod.TABULAR],
                CalendarMethodText[CalendarMethod.ISLAMIC],
                CalendarMethodText[CalendarMethod.RGSA],
            ].forEach(label => calCombo.append_text(label));
            calCombo.set_active(settings.get_int('calendar-method'));
            calCombo.connect('changed', () => {
                settings.set_int('calendar-method', calCombo.get_active());
            });
            calRow.append(calCombo);
            languageGroup.add(calRow);
        }

        /* Format group */
        const formatGroup = groupAdd(_('Format'));

        /* Date format row */
        const fmtLabel = new Gtk.Label({
            label: _('Date Format'),
            xalign: 0,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const formatBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            halign: Gtk.Align.END,
        });
        const hBox = new Gtk.Box({ spacing: 4, halign: Gtk.Align.END });

        const fmtEntry = new Gtk.Entry({
            text: settings.get_string('date-format'),
            width_chars: 38,
        });
        _setAccessibleName(fmtEntry, fmtLabel.label);
        fmtEntry.placeholder_text = _('{day} {month} {year} {suffix}');
        hBox.append(fmtEntry);

        const resetBtn = new Gtk.Button({
            css_classes: ['reset-btn', 'flat'],
        });
        _setAccessibleName(resetBtn, _('Reset'));
        resetBtn.set_child(Gtk.Image.new_from_icon_name('view-refresh-symbolic'));
        hBox.append(resetBtn);

        const note = new Gtk.Label({
            label: _('Note: When language is Arabic, order of tokens is reversed'),
            xalign: 0,
            halign: Gtk.Align.START,
            wrap: true,
            max_width_chars: 60,
            css_classes: ['format-help-text'],
        });
        formatBox.append(hBox);
        formatBox.append(note);

        let fmtRow;
        if (Adw) {
            fmtRow = new Adw.ActionRow({
                title: _('Date Format'),
                activatable: false,
                selectable: false,
            });
            fmtRow.add_css_class('no-row-hover');
            fmtRow.add_suffix(formatBox);
        } else {
            fmtRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                hexpand: true,
            });
            fmtLabel.hexpand = true;
            fmtRow.append(fmtLabel);
            fmtRow.append(formatBox);
        }

        formatGroup.add(fmtRow);

        const commit = txt => settings.set_string('date-format', txt.trim());
        const validate = () => {
            const txt = fmtEntry.text.trim();
            const ok  = /{day}|{month}|{year}|{suffix}/.test(txt);

            if (ok) commit(txt);

            if (Adw) {
                fmtRow.remove_css_class(ok ? 'error' : 'valid');
                fmtRow.add_css_class(ok ? 'valid' : 'error');
            } else {
                /* fallback: entry css */
                fmtEntry.remove_css_class(ok ? 'error' : 'valid');
                fmtEntry.add_css_class(ok ? 'valid' : 'error');
            }
        };
        fmtEntry.connect('changed', validate);
        validate();

        resetBtn.connect('clicked', () =>
            fmtEntry.text = '{day} {month} {year} {suffix}'
        );

        const offsetRow = Adw ? new Adw.ActionRow({
            title: _('Hijri Date Adjustment'),
            activatable: false,
            selectable: false,
        }) : new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, hexpand: true });
        if (Adw) offsetRow.add_css_class('no-row-hover');

        const adjustBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['linked'],
            halign: Gtk.Align.END,
        });

        const minusBtn = new Gtk.Button({
            label: '-',
            can_focus: true,
            css_classes: ['option-button'],
        });
        const plusBtn = new Gtk.Button({
            label: '+',
            can_focus: true,
            css_classes: ['option-button'],
        });
        _setAccessibleName(minusBtn, _('Decrease date offset'));
        _setAccessibleName(plusBtn, _('Increase date offset'));

        adjustBox.append(minusBtn);
        adjustBox.append(plusBtn);

        const offsetValue = new Gtk.Label({
            xalign: 1,
            valign: Gtk.Align.CENTER,
        });

        const formatOffsetLabel = value => {
            if (value === 0)
                return '0';
            return value > 0 ? `+${value}` : `${value}`;
        };

        const updateOffsetLabel = () => {
            offsetValue.label = formatOffsetLabel(settings.get_int('date-offset'));
        };

        const adjustOffset = delta => {
            const next = settings.get_int('date-offset') + delta;
            settings.set_int('date-offset', next);
            updateOffsetLabel();
        };

        minusBtn.connect('clicked', () => adjustOffset(-1));
        plusBtn.connect('clicked', () => adjustOffset(1));
        settings.connect('changed::date-offset', updateOffsetLabel);
        updateOffsetLabel();

        const offsetBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.END,
        });
        offsetBox.append(adjustBox);
        offsetBox.append(offsetValue);

        if (Adw) {
            offsetRow.add_suffix(offsetBox);
            formatGroup.add(offsetRow);
        } else {
            offsetRow.append(new Gtk.Label({ label: _('Hijri Date Adjustment'), xalign: 0, hexpand: true }));
            offsetRow.append(offsetBox);
            formatGroup.add(offsetRow);
        }

        formatGroup.add(new SegmentedRow(
            _('Position'), PositionText,
            settings.get_int('position'),
            idx => {
                const previousPosition = settings.get_int('position');
                if (idx === Position.CENTER && hasCenterPosition) {
                    let centerPosition = CenterPosition.LEFT;
                    if (previousPosition === Position.CENTER) {
                        const currentCenterPosition = settings.get_int('center-position');
                        centerPosition = [CenterPosition.RIGHT, CenterPosition.MIDDLE_RIGHT]
                            .includes(currentCenterPosition)
                            ? CenterPosition.MIDDLE_RIGHT
                            : CenterPosition.MIDDLE_LEFT;
                    } else if ([Position.RIGHT, Position.FAR_RIGHT].includes(previousPosition)) {
                        centerPosition = CenterPosition.RIGHT;
                    }

                    settings.set_int('center-position', centerPosition);
                }
                settings.set_int('position', idx);
            },
            _('Note: Right → Center → Center selects middle-right; Left → Center → Center selects middle-left.')
        ).row);

        /* Show year + suffix style */
        const yearSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-year'),
            valign: Gtk.Align.CENTER,
            css_classes: ['year-toggle-switch'],
        });

        if (Adw) {
            const showYearRow = new Adw.ActionRow({ title: _('Show Year'), activatable: true });
            showYearRow.add_suffix(yearSwitch);
            settings.bind('show-year', yearSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
            formatGroup.add(showYearRow);
        } else {
            const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            row.append(new Gtk.Label({ label: _('Show Year'), xalign: 0, hexpand: true }));
            row.append(yearSwitch);
            /* manual bind for GTK-only fallback */
            yearSwitch.connect('notify::active', () => settings.set_boolean('show-year', yearSwitch.active));
            formatGroup.add(row);
        }

        const yearSuffixRow = new SegmentedRow(
            _('Year Suffix Style'), YearSuffixStyleText,
            settings.get_int('year-suffix-style'),
            idx => settings.set_int('year-suffix-style', idx)
        );
        formatGroup.add(yearSuffixRow.row);

        const toggleSuffixSensitivity = () => {
            const enabled = settings.get_boolean('show-year');
            yearSuffixRow._buttons.forEach(btn => (btn.sensitive = enabled));
        };
        yearSwitch.connect('notify::active', toggleSuffixSensitivity);
        toggleSuffixSensitivity();
    }

    if (!includeAppearance)
        return;

    /* Appearance / Color group */
    const addToAppearance = (row) => {
        if (Adw) {
            if (!container._appearanceGroup) {
                container._appearanceGroup = new Adw.PreferencesGroup({
                    title: _('Color Customization'),
                    description: _('Personalize the appearance of your Hijri date'),
                });
                if (container.add) container.add(container._appearanceGroup);
            }
            container._appearanceGroup.add(row);
        } else {
            /* fallback: put after format group inside same container */
            container.add(row);
        }
    };

    if (Adw) {
        const colorExpander = new Adw.ExpanderRow({
            title: _('Text Color Picker'),
            subtitle: _('Customize the text color'),
            show_enable_switch: false,
            expanded: true,
        });

        const colorContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 8, margin_bottom: 8, margin_start: 8, margin_end: 8,
        });

        let hexEntry;
        const colorWheel = new ColorWheel(
            settings.get_string('text-color'),
            (color) => {
                settings.set_string('text-color', color);
                hexEntry.set_text(color);
            }
        );

        const brightnessBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
        const brightnessLabel = new Gtk.Label({ label: _('Brightness'), xalign: 0 });
        const brightnessScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 1, step_increment: 0.01, value: colorWheel.value }),
            draw_value: false,
            hexpand: true,
        });
        _setAccessibleName(brightnessScale, brightnessLabel.label);
        brightnessScale.connect('value-changed', () => colorWheel.setValue(brightnessScale.get_value()));
        brightnessBox.append(brightnessLabel);
        brightnessBox.append(brightnessScale);

        const hexBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.CENTER });
        const hexLabel = new Gtk.Label({ label: _('Hex Code:') });
        hexEntry = new Gtk.Entry({
            text: settings.get_string('text-color'),
            placeholder_text: '#ffffff',
            max_length: 7,
            width_chars: 8,
        });
        _setAccessibleName(hexEntry, hexLabel.label);

        hexEntry.connect('changed', () => {
            let hex = hexEntry.get_text().trim();
            if (hex.length > 0 && !hex.startsWith('#'))
                hex = '#' + hex;

            const isValid = hex.length === 0 || /^#?[0-9A-Fa-f]{6}$/.test(hex);
            if (isValid && hex.length > 0) {
                if (!hex.startsWith('#'))
                    hex = '#' + hex;
                hex = hex.toLowerCase();
                hexEntry.remove_css_class('error-state');
                colorWheel.setColor(hex);
                settings.set_string('text-color', hex);
            } else if (hex.length > 0) {
                hexEntry.add_css_class('error-state');
            } else {
                hexEntry.remove_css_class('error-state');
            }
        });

        hexBox.append(hexLabel);
        hexBox.append(hexEntry);

        colorContainer.append(colorWheel);
        colorContainer.append(brightnessBox);
        colorContainer.append(hexBox);

        const colorRow = new Adw.ActionRow();
        colorRow.set_child(colorContainer);
        colorExpander.add_row(colorRow);

        addToAppearance(colorExpander);
    } else {
        /* GTK-only fallback (no Adw): put controls directly in a box */
        const frame = new Gtk.Frame({ label: _('Text Color Picker') });
        const colorContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 8, margin_bottom: 8, margin_start: 8, margin_end: 8,
        });

        let hexEntry;
        const colorWheel = new ColorWheel(
            settings.get_string('text-color'),
            (color) => {
                settings.set_string('text-color', color);
                hexEntry.set_text(color);
            }
        );

        const brightnessBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
        const brightnessLabel = new Gtk.Label({ label: _('Brightness'), xalign: 0 });
        const brightnessScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 1, step_increment: 0.01, value: colorWheel.value }),
            draw_value: false,
            hexpand: true,
        });
        _setAccessibleName(brightnessScale, brightnessLabel.label);
        brightnessScale.connect('value-changed', () => colorWheel.setValue(brightnessScale.get_value()));
        brightnessBox.append(brightnessLabel);
        brightnessBox.append(brightnessScale);

        const hexBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.CENTER });
        const hexLabel = new Gtk.Label({ label: _('Hex Code:') });
        hexEntry = new Gtk.Entry({
            text: settings.get_string('text-color'),
            placeholder_text: '#ffffff',
            max_length: 7,
            width_chars: 8,
        });
        _setAccessibleName(hexEntry, hexLabel.label);

        hexEntry.connect('changed', () => {
            let hex = hexEntry.get_text().trim();
            if (hex.length > 0 && !hex.startsWith('#'))
                hex = '#' + hex;

            const isValid = hex.length === 0 || /^#?[0-9A-Fa-f]{6}$/.test(hex);
            if (isValid && hex.length > 0) {
                if (!hex.startsWith('#'))
                    hex = '#' + hex;
                hex = hex.toLowerCase();
                hexEntry.remove_css_class('error-state');
                colorWheel.setColor(hex);
                settings.set_string('text-color', hex);
            } else if (hex.length > 0) {
                hexEntry.add_css_class('error-state');
            } else {
                hexEntry.remove_css_class('error-state');
            }
        });

        hexBox.append(hexLabel);
        hexBox.append(hexEntry);

        colorContainer.append(colorWheel);
        colorContainer.append(brightnessBox);
        colorContainer.append(hexBox);

        frame.set_child(colorContainer);
        container.add(frame);
    }
}

/* ── 42–44 API ────────────────────────────────────────── */
// Called by the GNOME 42-44 preferences loader.
// eslint-disable-next-line no-unused-vars
function fillPreferencesWindow(window) {
    _loadStylesheet();

    const settings = ExtensionUtils.getSettings();

    if (!Adw) {
        /* On 40–41, Adw may be missing → build fallback content inside a plain box */
        const root = buildPrefsWidget();
        /* In GNOME 42+ the window exists; add content as a single page */
        const scroller = new Gtk.ScrolledWindow({ hexpand: true, vexpand: true });
        scroller.set_child(root);
        /* Embed into a simple Adw container only if Adw exists; otherwise GTK box is fine */
        window.set_content(scroller);
        return;
    }

    window.add_css_class('hijri-prefs');
    _applyColorSchemeClass(window);

    /* Two pages like your original file */
    const generalPage = new Adw.PreferencesPage({
        title: _('General Settings'),
        icon_name: 'preferences-system-symbolic',
    });
    generalPage.add_css_class('compact-page');

    const appearancePage = new Adw.PreferencesPage({
        title: _('Appearance'),
        icon_name: 'applications-graphics-symbolic',
    });

    window.add(generalPage);
    window.add(appearancePage);

    /* Build groups/rows into pages */
    _buildSharedUI(generalPage, settings, 'general');
    _buildSharedUI(appearancePage, settings, 'appearance');
}

/* ── 40–41 API ────────────────────────────────────────── */
function buildPrefsWidget() {
    _loadStylesheet();

    const settings = ExtensionUtils.getSettings();

    const root = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
    });
    root.add_css_class('hijri-prefs');

    /* A simple container with the same rows/groups */
    const container = {
        add: w => root.append(w),
    };

    _buildSharedUI(container, settings);

    /* Scroll, because some layouts get tall */
    const scroller = new Gtk.ScrolledWindow({ hexpand: true, vexpand: true });
    scroller.set_child(root);
    scroller.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);

    return scroller;
}

/* ── init() for translations ──────────────────────────── */
// Called by GNOME Shell's legacy preferences loader.
// eslint-disable-next-line no-unused-vars
function init() {
    ExtensionUtils.initTranslations();
}
