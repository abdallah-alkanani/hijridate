'use strict';

/* ── Imports ──────────────────────────────────────────── */
import Adw     from 'gi://Adw';
import Gio     from 'gi://Gio';
import Gtk     from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gdk     from 'gi://Gdk';
import GLib    from 'gi://GLib';

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

// Continuous Color Wheel Picker
const ColorWheel = GObject.registerClass(
class ColorWheel extends Gtk.DrawingArea {
    _init(initialColor, onChange) {
        super._init({
            width_request: 200,
            height_request: 200,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        this.onChange = onChange;
        this.currentColor = initialColor || '#ffffff';
        this._isDragging = false;
        
        const hsv = this._hexToHsv(this.currentColor);
        this.hue = hsv.h;
        this.saturation = hsv.s;
        this.value = hsv.v;

        this.set_draw_func(this._draw.bind(this));

        // Use a motion controller for smooth dragging
        const motionController = new Gtk.EventControllerMotion();
        motionController.connect('motion', (controller, x, y) => {
            if (this._isDragging) {
                this._updateColorFromPosition(x, y);
            }
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

        // Draw color wheel
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

        // Draw selection indicator
        const angle = (this.hue - 90) * Math.PI / 180;
        const distance = this.saturation * radius;
        const selX = centerX + Math.cos(angle) * distance;
        const selY = centerY + Math.sin(angle) * distance;

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
            b: Math.round((b + m) * 255)
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
        const cssPath = `${this.dir.get_path()}/prefs.css`;
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
        const settings = this.getSettings();
        this._loadStylesheet();


        const tr = raw =>
            Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, _(v)]));

        const PositionText        = tr(PositionTextRAW);
        const LanguageText        = tr(LanguageTextRAW);
        const NumberLanguageText  = tr(NumberLanguageTextRAW);
        const YearSuffixStyleText = tr(YearSuffixStyleTextRAW);

        
        const page = new Adw.PreferencesPage({ 
            title: _('General Settings'),
            icon_name: 'preferences-system-symbolic'
        });
        page.add_css_class('compact-page');
        window.add(page);
        
        // Add Appearance page
        const appearancePage = new Adw.PreferencesPage({ 
            title: _('Appearance'),
            icon_name: 'applications-graphics-symbolic'
        });
        window.add(appearancePage);


        const languageGroup = new Adw.PreferencesGroup({ title: _('Language') });
        page.add(languageGroup);
        languageGroup.add(new SegmentedRow(
            _('Language'), LanguageText,
            settings.get_int('language'),
            idx => settings.set_int('language', idx)
        ).row);

        languageGroup.add(new SegmentedRow(
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

        const vBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });

        const hBox = new Gtk.Box({ spacing: 4 });

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

        // Create Format group
        const formatGroup = new Adw.PreferencesGroup({ title: _('Format') });
        page.add(formatGroup);
        formatGroup.add(fmtRow);
        const commit = txt => settings.set_string('date-format', txt.trim());
        const validate = () => {
            const txt = fmtEntry.text.trim();
            const ok  = /{day}|{month}|{year}|{suffix}/.test(txt);

            if (ok) commit(txt);

            fmtRow.remove_css_class(ok ? 'error' : 'valid');
            fmtRow.add_css_class(ok ? 'valid' : 'error');
        };
        fmtEntry.connect('changed', validate);
        validate();

        resetBtn.connect('clicked', () =>
            fmtEntry.text = '{day} {month} {year} {suffix}'
        );     



        
        formatGroup.add(new SegmentedRow(
            _('Position'), PositionText,
            settings.get_int('position'),
            idx => settings.set_int('position', idx)
        ).row);

        const showYearRow = new Adw.ActionRow({ title: _('Show Year'), activatable: true });
        const yearSwitch  = new Gtk.Switch({
            active: settings.get_boolean('show-year'),
            valign: Gtk.Align.CENTER,
            css_classes: ['year-toggle-switch'],
        });
        showYearRow.add_suffix(yearSwitch);
        settings.bind('show-year', yearSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        formatGroup.add(showYearRow);

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
        
        // Color Customization Group in Appearance page
        const colorGroup = new Adw.PreferencesGroup({ 
            title: _('Color Customization'),
            description: _('Personalize the appearance of your Hijri date')
        });
        appearancePage.add(colorGroup);

        // Color Expander (expanded by default)
        const colorExpander = new Adw.ExpanderRow({
            title: _('Text Color Picker'),
            subtitle: _('Customize the text color'),
            show_enable_switch: false,
            expanded: true,  // Always expanded by default
        });

        const colorContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        this._colorWheel = new ColorWheel(
            settings.get_string('text-color'),
            (color) => {
                settings.set_string('text-color', color);
                this._hexEntry.set_text(color);
            }
        );

        // Brightness controls
        const brightnessBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
        });

        const brightnessLabel = new Gtk.Label({
            label: _('Brightness'),
            xalign: 0,
        });

        const brightnessScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1,
                step_increment: 0.01,
                value: this._colorWheel.value,
            }),
            draw_value: false,
            hexpand: true,
        });

        brightnessScale.connect('value-changed', () => {
            this._colorWheel.setValue(brightnessScale.get_value());
        });

        brightnessBox.append(brightnessLabel);
        brightnessBox.append(brightnessScale);

        // Hex input
        const hexBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.CENTER,
        });

        const hexLabel = new Gtk.Label({
            label: _('Hex Code:'),
        });

        this._hexEntry = new Gtk.Entry({
            text: settings.get_string('text-color'),
            placeholder_text: '#ffffff',
            max_length: 7,
            width_chars: 8,
        });

        this._hexEntry.connect('changed', () => {
            let hex = this._hexEntry.get_text().trim();
            
            // Add hashtag if missing and not empty
            if (hex.length > 0 && !hex.startsWith('#')) {
                hex = '#' + hex;
            }
            
            // Validate hex color (with or without hashtag, case insensitive)
            const isValid = hex.length === 0 || /^#?[0-9A-Fa-f]{6}$/.test(hex);
            
            if (isValid && hex.length > 0) {
                // Valid input - ensure hashtag is present for storage
                if (!hex.startsWith('#')) {
                    hex = '#' + hex;
                }
                // Convert to lowercase for consistency
                hex = hex.toLowerCase();
                
                // Remove error state
                this._hexEntry.remove_css_class('error-state');
                
                this._colorWheel.setColor(hex);
                settings.set_string('text-color', hex);
            } else if (hex.length > 0) {
                // Invalid input - persistent red state
                this._hexEntry.add_css_class('error-state');
            } else {
                // Empty input - neutral state
                this._hexEntry.remove_css_class('error-state');
            }
        });

        hexBox.append(hexLabel);
        hexBox.append(this._hexEntry);

        colorContainer.append(this._colorWheel);
        colorContainer.append(brightnessBox);
        colorContainer.append(hexBox);

        const colorRow = new Adw.ActionRow();
        colorRow.set_child(colorContainer);
        colorExpander.add_row(colorRow);
        
        colorGroup.add(colorExpander);
    }
}
