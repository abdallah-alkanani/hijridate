/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

'use strict';

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';


const SegmentedButtonRow = GObject.registerClass(
class SegmentedButtonRow extends PopupMenu.PopupBaseMenuItem {
    
    _init(title, items, active, onChange) {
        super._init({ activate: false });   // row itself isn't clickable

        /* Title (left-hand side) */
        this._label = new St.Label({ text: title, x_align: Clutter.ActorAlign.START });
        this._label.add_style_class_name('row-title'); 
        this.add_child(this._label);
        /* no hover highlight for this row */
        this.reactive     = false;   // row ignores pointer; children still receive it
        this.track_hover  = false;
        this.can_focus    = false;
        this.add_style_class_name('no-row-hover');
        /* Segmented container (right-hand side) */
        const box = new St.BoxLayout({ style_class: 'linked', x_expand: false });
        this.add_child(box);

        /* Build the toggle buttons */
        this._buttons = [];

        items.forEach((txt, idx) => {
            const btn = new St.Button({
                label: txt,
                style_class: 'option-button',
                toggle_mode: true,
                reactive: true,
                can_focus: true,
            });

            if (idx === active)
                btn.add_style_pseudo_class('active');

            box.add_child(btn);
            this._buttons.push(btn);

            btn.connect('clicked', () => {
                /* Visual state */
                this._buttons.forEach(b => b.remove_style_pseudo_class('active'));
                btn.add_style_pseudo_class('active');

                /* Notify extension logic */
                onChange(idx);
            });
        });
        this._label.set_y_align(Clutter.ActorAlign.CENTER);
box.set_y_align(Clutter.ActorAlign.CENTER);

    }
    
    // Add a method to enable/disable the entire row
    setSensitive(sensitive) {
        super.setSensitive(sensitive);
        this._buttons.forEach(btn => btn.reactive = sensitive);
    }
});

// Language options
const Language = {
    ENGLISH: 0,
    ARABIC: 1
};

// Number Language options
const NumberLanguage = {
    ENGLISH: 0,
    ARABIC: 1
};

// Year Suffix Style options
const YearSuffixStyle = {
    AH: 0,
    HEH: 1 // هـ
};



function getHijriDate(lang   = Language.ENGLISH,
    numLng = NumberLanguage.ENGLISH,
    showY  = false,
    suff   = YearSuffixStyle.AH,
    fmtStr = '{day} {month} {year} {suffix}') {
    try {
        const d = new Date();
        const locale = (lang === Language.ARABIC)
            ? 'ar-SA-u-ca-islamic-umalqura'
            : 'en-US-u-ca-islamic-umalqura';
        const numSys = (numLng === NumberLanguage.ARABIC) ? 'arab' : 'latn';

        const fmt = new Intl.DateTimeFormat(locale, {
            day:'numeric', month:'long', year:'numeric', numberingSystem:numSys
        }).formatToParts(d);

        // Create dictionary of date parts
        const dict = Object.fromEntries(fmt.filter(p => (
            p.type === 'day' || p.type === 'month' || p.type === 'year'
        )).map(p => [p.type, p.value]));
        
        // Always keep year value, even if showY is false
        // The format string will determine if it's used
        const yearValue = dict.year;
        
        // Process format string - any arrangement of tokens is allowed
        // This will replace all instances of tokens, even if repeated
        let out = fmtStr;
        
        // Replace all occurrences of each token
        if (dict.day) {
            out = out.replace(/{day}/g, dict.day);
        }
        
        if (dict.month) {
            out = out.replace(/{month}/g, dict.month);
        }
        
        /* year token */
        out = out.replace(/{year}/g, showY ? yearValue : '');

        /* suffix token – only if year is actually shown */
        const suffixText = showY
            ? ((suff === YearSuffixStyle.HEH) ? ' هـ' : ' AH')
            : '';
        out = out.replace(/{suffix}/g, suffixText);
        
        
        // Clean up any mess from the replacements
        // Collapse duplicate whitespace, multiple commas, etc.
        out = out.replace(/\s+/g, ' ')               // multiple spaces to single space
               .replace(/,\s*,+/g, ',')              // multiple commas to single comma
               .replace(/,+/g, ', ')                 // standardize comma spacing
               .replace(/\s*,\s*/g, ', ')            // standardize comma spacing
               .replace(/^\s+|\s+$|\,+$|\,+\s+$/g, ''); // trim spaces and commas at ends

        return out.trim() || '(Hijri Date)';
    } catch (e) {
        console.error('Hijri date build error:', e);
        return '(Hijri Date)';
    }
}






// Position options as both enum and readable text
const Position = {
    FAR_LEFT: 0,
    LEFT: 1,
    CENTER: 2,
    RIGHT: 3,
    FAR_RIGHT: 4,
};

const PositionText = {
    [Position.FAR_LEFT]: 'Far Left',
    [Position.LEFT]: 'Left',
    [Position.CENTER]: 'Center',
    [Position.RIGHT]: 'Right',
    [Position.FAR_RIGHT]: 'Far Right',
};

// Default spacing in pixels if setting not available
const DEFAULT_SPACING = 0;

// Define language text for menu items
const LanguageText = {
    [Language.ENGLISH]: 'English',
    [Language.ARABIC]: 'Arabic'
};

// Define number language text for menu items
const NumberLanguageText = {
    [NumberLanguage.ENGLISH]: 'English',
    [NumberLanguage.ARABIC]: 'Arabic'
};

// Define year suffix style text for menu items
const YearSuffixStyleText = {
    [YearSuffixStyle.AH]: 'AH',
    [YearSuffixStyle.HEH]: 'هـ'
};

// Create the Hijri Date button class
const HijriDateButton = GObject.registerClass(
    class HijriDateButton extends PanelMenu.Button {
        _init(extension) {
            // Initialize with 0.5 alignment to center the menu
            super._init(0.5, 'Hijri Date');
            
            this._extension = extension;
            
            // Create a box to hold our label and handle spacing
            this.box = new St.BoxLayout({
                style_class: 'panel-status-menu-box'
            });
            
            // Create the label with the Hijri date
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
            
            // Add the label to the box
            this.box.add_child(this.label);
            
            // Add the box to the button
            this.add_child(this.box);
            
            // Create a spacer widget if spacing is enabled
            if (this._extension._spacing > 0) {
                this._spacer = new St.Widget({
                    style: `width: ${this._extension._spacing}px;`,
                    reactive: false,
                    track_hover: false,
                    can_focus: false
                });
                // Add the spacer to the panel next to our button
                this._extension._addSpacerToPanel(this._spacer);
            }
            
            // Add style class for the button
            this.add_style_class_name('hijri-date-button');
            
            // Force menu to appear below the button
            this.menu.actor.add_style_class_name('popup-menu-below-panel');
            
            // Set menu arrow alignment to center (0.5)
            this.menu._arrowAlignment = 0.5;
            
            // Add language options to menu
            this._addLanguageOptions();
            
            // Add number language options to menu
            this._addNumberLanguageOptions();
            
            this._addDateFormatOption(); 
            // Add position options to menu
            this._addPositionOptions();
            
            // Add show year option to menu
            this._addShowYearOption();

            // Add year suffix style options to menu
            this._addYearSuffixStyleOptions();
            
            // Connect to settings changes
            this._settingsChangedId = this._extension._settings.connect('changed', (settings, key) => {
                if (key === 'position' || key === 'spacing') {
                    // Refresh the extension to apply the new settings
                    this._extension.disable();
                    this._extension.enable();
                } else if (key === 'language') {
                    // Just update the language without restarting
                    this._extension._language = settings.get_int('language');
                    this._updateDate();
                    // Note: With segmented buttons, no need to update checks as the active state is in the button
                } else if (key === 'number-language') {
                    // Just update the number language without restarting
                    this._extension._numberLanguage = settings.get_int('number-language');
                    this._updateDate();
                    // Note: With segmented buttons, no need to update checks as the active state is in the button
                } else if (key === 'show-year') {
                    // Just update the show year option without restarting
                    this._extension._showYear = settings.get_boolean('show-year');
                    this._updateDate();
                    this._updateYearSuffixStyleSensitivity(); // Update sensitivity of suffix style options
                } else if (key === 'year-suffix-style') {
                    this._extension._yearSuffixStyle = settings.get_int('year-suffix-style');
                    this._updateDate();
                    // Note: With segmented buttons, no need to update checks as the active state is in the button
                } else if (key === 'date-format') {
                    this._extension._dateFormat = settings.get_string('date-format');
                    this._updateDate();
                }
            });
            
            // Update the date every minute
            this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                this._updateDate();
                return GLib.SOURCE_CONTINUE;
            });
        }
        
        _addLanguageOptions() {
            // Get language items array
            const langItems = Object.values(LanguageText);
            
            // Create segmented button row for language selection
            const langRow = new SegmentedButtonRow(
                _('Language'),                  // title on the left
                langItems,                      // buttons
                this._extension._language,      // current selection
                idx => {
                    // Save the new language to gsettings
                    this._extension._settings.set_int('language', idx);
                    
                    // Update the extension language
                    this._extension._language = idx;
                    
                    // Update the displayed date
                    this._updateDate();
                }
            );
            
            this.menu.addMenuItem(langRow);
            
            // Add a separator after language options
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        
        _updateLanguageChecks(activeLanguage) {
            // Update checkmarks for language menu items
            let items = this.menu._getMenuItems();
            let inLanguageSection = false;
            
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                // Check if we're in the language section
                if (item instanceof PopupMenu.PopupMenuItem && 
                    item.label.text === _('Language')) {
                    inLanguageSection = true;
                    continue;
                }
                
                // Exit the language section when we hit a separator
                if (item instanceof PopupMenu.PopupSeparatorMenuItem) {
                    inLanguageSection = false;
                    continue;
                }
                
                // Update checkmarks for language items
                if (inLanguageSection && item instanceof PopupMenu.PopupMenuItem) {
                    const itemLanguage = Object.values(LanguageText).indexOf(item.label.text);
                    if (itemLanguage === activeLanguage) {
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                    } else {
                        item.setOrnament(PopupMenu.Ornament.NONE);
                    }
                }
            }
        }
        
        _addNumberLanguageOptions() {
            // Get number language items array
            const numberLangItems = Object.values(NumberLanguageText);
            
            // Create segmented button row for number language selection
            const numberLangRow = new SegmentedButtonRow(
                _('Number Language'),            // title on the left
                numberLangItems,                  // buttons
                this._extension._numberLanguage,  // current selection
                idx => {
                    // Save the new number language to gsettings
                    this._extension._settings.set_int('number-language', idx);
                    
                    // Update the extension number language
                    this._extension._numberLanguage = idx;
                    
                    // Update the displayed date
                    this._updateDate();
                }
            );
            
            this.menu.addMenuItem(numberLangRow);
            
            // Add a separator after number language options
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        /**  Date‐format free‐text row  ───────────────────────────────────── */
        _addDateFormatOption() {
            // 1) Create a single PopupBaseMenuItem (no hover highlight)
            const row = new PopupMenu.PopupBaseMenuItem({ activate: false });
            row.add_style_class_name('no-row-hover');
            row.add_style_class_name('hijri-date-menu-item'); 
            //                                           ^— reuses same padding as other rows

            // 2) Put a vertical box inside so we can stack “help text” over “label+entry”
            const vboxRow = new St.BoxLayout({
                vertical: true,
                x_expand: true
            });
            row.add_child(vboxRow);

            // 3) Top: the small help text
            const help = new St.Label({
                text: _('Tokens: {day}  {month}  {year}  {suffix}    '
                    + 'Note: When language is Arabic, order of tokens is reversed'),
                style_class: 'format-help-text-popup',
                x_align: Clutter.ActorAlign.START
            });
            // Give it a tiny bottom margin so it doesn’t butt right up against the entry
            help.set_margin_bottom(4);
            vboxRow.add_child(help);

            // 4) Bottom: a single horizontal box for “Date Format” label + (entry + reset)
            const hboxRow = new St.BoxLayout({
                x_expand: true
            });
            vboxRow.add_child(hboxRow);

            // 5) Left: “Date Format” label, vertically centered
            const lbl = new St.Label({
                text: _('Date Format'),
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER
            });
            lbl.add_style_class_name('row-title');
            // Give it a fixed width so it lines up with the segmented buttons above (optional tweak)
            lbl.set_width(120);  
            hboxRow.add_child(lbl);

            // 6) Right: another box (“linked”) to hold entry + reset button
            const innerBox = new St.BoxLayout({
                style_class: 'linked',
                x_expand: true
            });
            hboxRow.add_child(innerBox);

            // 7) The text‐entry itself
            const entry = new St.Entry({
                text: this._extension._dateFormat,
                style_class: 'option-entry',
                can_focus: true,
                x_expand: true
            });
            // Vertically center the Entry so it lines up with the label
            entry.set_y_align(Clutter.ActorAlign.CENTER);
            innerBox.add_child(entry);

            // 8) A small reset button (undo icon)
            const reset = new St.Button({
                style_class: 'system-menu-action',
                child: new St.Icon({ icon_name: 'edit-undo-symbolic', icon_size: 16 }),
                can_focus: true
            });
            innerBox.add_child(reset);

            // 9) Wire up “save on change” and “reset → default”
            const save = () => {
                const txt = entry.get_text();
                this._extension._settings.set_string('date-format', txt);
                this._extension._dateFormat = txt;
                this._updateDate();
            };
            entry.clutter_text.connect('text-changed', save);
            reset.connect('clicked', () => {
                entry.set_text('{day} {month} {year} {suffix}');
                save();
            });

            // 10) Finally, insert this row into the popup
            this.menu.addMenuItem(row);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        _updateNumberLanguageChecks(activeNumberLanguage) {
            // Update checkmarks for number language menu items
            let items = this.menu._getMenuItems();
            let inNumberLanguageSection = false;
            
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                // Check if we're in the number language section
                if (item instanceof PopupMenu.PopupMenuItem && 
                    item.label.text === _('Number Language')) {
                    inNumberLanguageSection = true;
                    continue;
                }
                
                // Exit the number language section when we hit a separator
                if (item instanceof PopupMenu.PopupSeparatorMenuItem) {
                    inNumberLanguageSection = false;
                    continue;
                }
                
                // Update checkmarks for number language items
                if (inNumberLanguageSection && item instanceof PopupMenu.PopupMenuItem) {
                    const itemNumberLanguage = Object.values(NumberLanguageText).indexOf(item.label.text);
                    if (itemNumberLanguage === activeNumberLanguage) {
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                    } else {
                        item.setOrnament(PopupMenu.Ornament.NONE);
                    }
                }
            }
        }
        
        _addPositionOptions() {
            // Get position items array
            const positionItems = Object.values(PositionText);
            
            // Create segmented button row for position selection
            const positionRow = new SegmentedButtonRow(
                _('Position'),                // title on the left
                positionItems,                 // buttons
                this._extension._position,     // current selection
                idx => {
                    // Save the new position to gsettings
                    this._extension._settings.set_int('position', idx);
                    
                    // Update the extension position
                    this._extension.setPosition(idx);
                    
                    // Refresh the indicator
                    this._extension.disable();
                    this._extension.enable();
                }
            );
            
            this.menu.addMenuItem(positionRow);
            
            // Add a separator after position options
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        
        _updatePositionChecks(activePosition) {
            // Update checkmarks for position menu items
            let items = this.menu._getMenuItems();
            let inPositionSection = false;
            
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                // Check if we're in the position section
                if (item instanceof PopupMenu.PopupMenuItem && 
                    item.label.text === _('Position')) {
                    inPositionSection = true;
                    continue;
                }
                
                // Exit the position section at the end of the menu
                if (i === items.length - 1 || 
                    (item instanceof PopupMenu.PopupSeparatorMenuItem && inPositionSection)) {
                    inPositionSection = false;
                    continue;
                }
                
                // Update checkmarks for position items
                if (inPositionSection && item instanceof PopupMenu.PopupMenuItem) {
                    const itemPosition = Object.values(PositionText).indexOf(item.label.text);
                    if (itemPosition === activePosition) {
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                    } else {
                        item.setOrnament(PopupMenu.Ornament.NONE);
                    }
                }
            }
        }
        
        _addShowYearOption() {
            // Create the PopupSwitchMenuItem as before, but keep activate: false
            const showYearItem = new PopupMenu.PopupSwitchMenuItem(
                _('Show Year'),
                this._extension._showYear,
                { activate: false }
            );
        
            // Suppress only its built‐in hover highlight
            showYearItem.add_style_class_name('no-row-hover');
        
            // When the switch itself changes, update settings:
            showYearItem.connect('toggled', item => {
                const val = item.state;
                this._extension._settings.set_boolean('show-year', val);
                this._extension._showYear = val;
                this._updateDate();
                this._updateYearSuffixStyleSensitivity();
            });
        
            // ─────────── ADD THIS BLOCK ───────────
            // Catch any click on the row (everywhere) and flip the switch state:
            showYearItem.reactive = true;   // ensure it receives clicks
            showYearItem.track_hover = false; 
            showYearItem.can_focus = false;
            showYearItem.connect('button-press-event', (actor, event) => {
                // Flip the boolean state; this will fire 'toggled' above
                showYearItem.state = !showYearItem.state;
                // Stop propagation so the menu does not close
                return Clutter.EVENT_STOP;
            });
            // ───────────────────────────────────────
        
            this.menu.addMenuItem(showYearItem);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        
        
        
        _updateShowYearCheck(activeShowYear) {
            // No need to update with segmented buttons
            // Active state is handled by button's active pseudo-class
        }
        
        _addYearSuffixStyleOptions() {
            // Get year suffix style items array
            const yearSuffixItems = Object.values(YearSuffixStyleText);
            
            // Create segmented button row for year suffix style selection
            const yearSuffixRow = new SegmentedButtonRow(
                _('Year Suffix Style'),           // title on the left
                yearSuffixItems,                  // buttons
                this._extension._yearSuffixStyle,  // current selection
                idx => {
                    // Save the new year suffix style to gsettings
                    this._extension._settings.set_int('year-suffix-style', idx);
                    
                    // Update the extension year suffix style
                    this._extension._yearSuffixStyle = idx;
                    
                    // Update the displayed date
                    this._updateDate();
                }
            );
            
            // Store a reference for sensitivity control
            this._yearSuffixStyleRow = yearSuffixRow;
            
            this.menu.addMenuItem(yearSuffixRow);
            this._updateYearSuffixStyleSensitivity(); // Set initial sensitivity
        }



        _updateYearSuffixStyleSensitivity() {
            // Make the year suffix style row sensitive only if show year is enabled
            const showYear = this._extension._showYear;
            if (this._yearSuffixStyleRow) {
                this._yearSuffixStyleRow.setSensitive(showYear);
                this._yearSuffixStyleRow.setSensitive(true);  
            }
            const enabled = this._extension._showYear;

            /* row stays sensitive so the blue “active” state can show */
            if (this._yearSuffixStyleRow) {
                this._yearSuffixStyleRow.setSensitive(true);

                /* toggle only the individual buttons */
                this._yearSuffixStyleRow._buttons.forEach(btn => {
                    btn.sensitive = enabled;
                    btn.opacity = enabled ? 255 : 80;
                });
                this._yearSuffixStyleRow._label.opacity = enabled ? 255 : 80;
            }

            // Also update the section title's sensitivity if possible, or hide/show
            // For simplicity, we'll just disable items. The prefs.js handles group sensitivity.
        }
        
        _updateDate() {
            this.label.set_text(getHijriDate(
                this._extension._language, 
                this._extension._numberLanguage, 
                this._extension._showYear, 
                this._extension._yearSuffixStyle,
                this._extension._dateFormat
            ));
        }
        
        destroy() {
            // Remove the update timer
            if (this._timer) {
                GLib.source_remove(this._timer);
            }
            
            // Disconnect settings signal
            if (this._settingsChangedId) {
                this._extension._settings.disconnect(this._settingsChangedId);
            }
            
            // Remove the spacer if it exists
            if (this._spacer) {
                this._spacer.destroy();
            }
            
            super.destroy();
        }
    }
);

export default class HijriDateDisplayExtension extends Extension {
    // Initialize class properties
    _indicator = null;
    _position = Position.LEFT;
    _spacing = DEFAULT_SPACING; 
    _language = Language.ENGLISH;
    _numberLanguage = NumberLanguage.ENGLISH;
    _showYear = false;
    _yearSuffixStyle = YearSuffixStyle.AH; // Initialize with default
    _dateOrder = ['day', 'month', 'year']; // Initialize with default order
    _spacer = null;
    _settings = null;
    
    constructor(metadata) {
        super(metadata);
    }
    
    enable() {
        // Load settings from gsettings
        this._settings = this.getSettings('org.gnome.shell.extensions.hijridate');
        
        // Get position, spacing, language, number language and show year from settings
        this._position = this._settings.get_int('position');
        this._spacing = this._settings.get_int('spacing');
        this._language = this._settings.get_int('language');
        this._numberLanguage = this._settings.get_int('number-language'); // Corrected key
        this._showYear = this._settings.get_boolean('show-year'); // Corrected key
        this._yearSuffixStyle = this._settings.get_int('year-suffix-style'); // Read new setting
        this._dateFormat = this._settings.get_string('date-format');
        
        console.debug('Hijri Date using position:', PositionText[this._position]);
        console.debug('Hijri Date using language:', LanguageText[this._language]);
        console.debug('Hijri Date using number language:', NumberLanguageText[this._numberLanguage]);
        console.debug('Hijri Date using show year:', this._showYear);
        console.debug('Hijri Date using year suffix style:', YearSuffixStyleText[this._yearSuffixStyle]);
        console.debug('Hijri Date using date format:', this._dateFormat);
        
        // Make sure our stylesheet is loaded for the segmented buttons
        try {
            // Use the built-in load_stylesheet method from the Extension class
            this.loadStylesheet();
            console.debug('Successfully loaded stylesheet for segmented buttons');
        } catch (e) {
            console.error('Failed to load stylesheet:', e);
        }
        
        // Create our Hijri date indicator and pass extension reference
        this._indicator = new HijriDateButton(this);
        
        // Add the indicator to the panel
        this._addToPanel();
        console.debug('Hijri Date extension enabled with position:', PositionText[this._position]);
    }
    
    _addToPanel() {
        // First destroy the old indicator if it exists
        if (this._indicator) {
            this._indicator.destroy();
        }
        
        // Create a new indicator
        this._indicator = new HijriDateButton(this);
        
        // Calculate position parameters
        let boxName = this._getBoxPosition(this._position);
        let boxPos = 0;
        
        // Handle special positions
        if (this._position === Position.FAR_LEFT) {
            boxName = 'left';
            boxPos = 0;
        } else if (this._position === Position.FAR_RIGHT) {
            boxName = 'right';
            boxPos = -1; // End position
        } else if (this._position === Position.LEFT) {
            boxName = 'left';
            boxPos = 1; // Second position from left
        } else if (this._position === Position.RIGHT) {
            boxName = 'right';
            boxPos = 0;
        }
        
        // Add to panel in the appropriate box and position
        Main.panel.addToStatusArea('hijri-date', this._indicator, boxPos, boxName);
        
        // Set the menu arrow alignment to center (0.5) to ensure menu appears centered below the date
        if (this._indicator && this._indicator.menu) {
            this._indicator.menu._arrowAlignment = 0.5;
        }
    }
    
    // Allow changing position
    setPosition(position) {
        this._position = position;
        this._addToPanel();
        
        // Save settings
        saveSettings({
            position: this._position,
            spacing: this._spacing
        });
    }
    
    // Add a spacer widget to the panel next to our indicator
    _addSpacerToPanel(spacer) {
        this._spacer = spacer;
        
        // Get the panel box our indicator is in
        let box = null;
        switch(this._getBoxPosition(this._position)) {
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
        
        if (box && this._indicator && this._indicator.container) {
            let index = -1;
            
            // Find the index of our indicator in the box
            for (let i = 0; i < box.get_n_children(); i++) {
                if (box.get_child_at_index(i) === this._indicator.container) {
                    index = i;
                    break;
                }
            }
            
            // Add the spacer after our indicator if found
            if (index >= 0) {
                box.insert_child_at_index(this._spacer, index + 1);
            }
        }
    }
    
    _getBoxPosition(position) {
        // Translate position number to box name
        switch(position) {
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
        // Clean up the spacer if it exists
        if (this._spacer && this._spacer.get_parent()) {
            this._spacer.get_parent().remove_child(this._spacer);
            this._spacer = null;
        }
        
        // Clean up the indicator
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        log('Hijri Date extension disabled.');
    }
}
