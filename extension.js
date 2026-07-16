/* extension.js — GNOME Shell 40–44 backport */
'use strict';

/* GNOME 40–44: imports.* modules */
const St       = imports.gi.St;
const GObject  = imports.gi.GObject;
const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;

const Main       = imports.ui.main;
const PanelMenu  = imports.ui.panelMenu;
const PopupMenu  = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Me = ExtensionUtils.getCurrentExtension();
const _ = Gettext.domain(Me.metadata['gettext-domain']).gettext;


/* ----- Enums ------------------------------------------------------------- */

const Language = { ENGLISH: 0, ARABIC: 1 };
const NumberLanguage = { ENGLISH: 0, ARABIC: 1 };
const CalendarMethod = {
    UMM_AL_QURA: 0,
    CIVIL: 1,
    TABULAR: 2,
    ISLAMIC: 3,
    RGSA: 4,
};
const YearSuffixStyle = { AH: 0, HEH: 1 };
const Position = { FAR_LEFT: 0, LEFT: 1, CENTER: 2, RIGHT: 3, FAR_RIGHT: 4 };
const CenterPosition = { LEFT: 0, MIDDLE_LEFT: 1, RIGHT: 2, MIDDLE_RIGHT: 3 };

const DEFAULT_SPACING = 0;
const YEAR_RANGE_LIMIT = 200;

/* ----- Date helper -------------------------------------------------------- */

function shiftDateByDays(date, offsetDays) {
    const d = new Date(date);
    if (Number.isFinite(offsetDays) && offsetDays !== 0)
        d.setDate(d.getDate() + offsetDays);
    return d;
}

function isSameDay(left, right) {
    return left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate();
}

function isWorkDay(date) {
    return !'06'.includes(date.getDay().toString());
}

function getCalendarId(method) {
    switch (method) {
        case CalendarMethod.CIVIL:
            return 'islamic-civil';
        case CalendarMethod.TABULAR:
            return 'islamic-tbla';
        case CalendarMethod.ISLAMIC:
            return 'islamic';
        case CalendarMethod.RGSA:
            return 'islamic-rgsa';
        case CalendarMethod.UMM_AL_QURA:
        default:
            return 'islamic-umalqura';
    }
}

function buildHijriLocale(lang, calendarMethod) {
    const langTag = (lang === Language.ARABIC) ? 'ar-SA' : 'en-US';
    const calId = getCalendarId(calendarMethod);
    return `${langTag}-u-ca-${calId}`;
}

function createHijriFormatter(locale, options, fallbackLocale) {
    const fmt = new Intl.DateTimeFormat(locale, options);
    const calendar = fmt.resolvedOptions().calendar;
    if (calendar && calendar.startsWith('islamic'))
        return fmt;

    return new Intl.DateTimeFormat(fallbackLocale, options);
}

function buildHijriFormatters(lang, numLng, calendarMethod = CalendarMethod.UMM_AL_QURA) {
    const locale = buildHijriLocale(lang, calendarMethod);
    const fallbackLocale = buildHijriLocale(lang, CalendarMethod.UMM_AL_QURA);
    const numSys = (numLng === NumberLanguage.ARABIC) ? 'arab' : 'latn';
    const numericLocale = `en-US-u-ca-${getCalendarId(calendarMethod)}`;
    const numericFallbackLocale = 'en-US-u-ca-islamic-umalqura';

    return {
        displayDay: createHijriFormatter(locale, {
            day: 'numeric',
            numberingSystem: numSys,
        }, fallbackLocale),
        displayMonth: createHijriFormatter(locale, {
            month: 'long',
            numberingSystem: numSys,
        }, fallbackLocale),
        displayYear: createHijriFormatter(locale, {
            year: 'numeric',
            numberingSystem: numSys,
        }, fallbackLocale),
        numericParts: createHijriFormatter(numericLocale, {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
            numberingSystem: 'latn',
        }, numericFallbackLocale),
        locale,
        numSys,
    };
}

function getHijriNumericParts(date, formatter) {
    const parts = formatter.formatToParts(date);
    const dict = Object.fromEntries(parts
        .filter(p => ['day', 'month', 'year'].includes(p.type))
        .map(p => [p.type, p.value])
    );

    return {
        day: parseInt(dict.day, 10),
        month: parseInt(dict.month, 10),
        year: parseInt(dict.year, 10),
    };
}

function getHijriDate(
    lang = Language.ENGLISH,
    numLng = NumberLanguage.ENGLISH,
    calMethod = CalendarMethod.UMM_AL_QURA,
    showY = false,
    suff = YearSuffixStyle.AH,
    fmtStr = '{day} {month} {year} {suffix}',
    offsetDays = 0
) {
    const d = shiftDateByDays(new Date(), offsetDays);
    const locale = buildHijriLocale(lang, calMethod);
    const fallbackLocale = buildHijriLocale(lang, CalendarMethod.UMM_AL_QURA);
    const numSys = (numLng === NumberLanguage.ARABIC) ? 'arab' : 'latn';

    const parts = createHijriFormatter(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        numberingSystem: numSys,
    }, fallbackLocale).formatToParts(d);

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
             .replace(/^\s+|\s+$|,+$|,+\s+$/g, '');

    const fallbackLabel = _('Hijri Date');
    return out.trim() || `(${fallbackLabel})`;
}

/* ----- Panel button ------------------------------------------------------- */

const HijriDateButton = GObject.registerClass(
class HijriDateButtonClass extends PanelMenu.Button {
    _init(extension) {
        /* For 40–44 the ctor signature is (alignment, name, dontCreateMenu?) */
        PanelMenu.Button.prototype._init.call(this, 0.5, _('Hijri Date'));

        this._extension = extension;
        this._viewDate = null;
        this._currentAdjustedViewDate = null;
        this._currentMonthStartAdjustedDate = null;
        this._currentHijriMonth = null;
        this._currentHijriYear = null;
        this._monthStartDates = null;
        this._yearPickerBaseYear = null;
        this._yearPickerRange = 4;
        this._yearRangeMin = 1;
        this._yearRangeMax = 1;
        this._menuOpenChangedId = 0;

        this.box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });

        this.label = new St.Label({
            text: getHijriDate(
                this._extension._language,
                this._extension._numberLanguage,
                this._extension._calendarMethod,
                this._extension._showYear,
                this._extension._yearSuffixStyle,
                this._extension._dateFormat,
                this._extension._dateOffset
            ),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'hijri-date-label',
        });
        this.label_actor = this.label;

        this.box.add_child(this.label);
        this.add_child(this.box);

        /* initial color */
        this._updateColor();

        this.add_style_class_name('hijri-date-button');

        /* 40–44: menu.actor is valid */
        this.menu.actor.add_style_class_name('popup-menu-below-panel');
        this.menu.setSourceAlignment(0.5);

        this._addCalendar();
        this._addSettingsButton();

        this._menuOpenChangedId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                /* The calendar actors are only reliably staged once the menu
                 * is open, so this is the safe moment to read resolved theme
                 * colors and apply them to the weekday headings. */
                this._updateCalendarColor();
            } else {
                this._hidePickers();
            }
        });

        this._settingsChangedId = this._extension._settings.connect('changed', (settings, key) => {
            switch (key) {
                case 'position': {
                    const pos = settings.get_int('position');
                    this._extension.setPosition(pos);
                    break;
                }
                case 'center-position':
                    this._extension.setCenterPosition(settings.get_int('center-position'));
                    break;
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
                case 'week-language':
                    this._extension._weekLanguage = settings.get_int('week-language');
                    this._updateCalendar();
                    break;
                case 'number-language':
                    this._extension._numberLanguage = settings.get_int('number-language');
                    this._updateDate();
                    break;
                case 'calendar-method':
                    this._extension._calendarMethod = settings.get_int('calendar-method');
                    this._updateDate();
                    break;
                case 'show-year':
                    this._extension._showYear = settings.get_boolean('show-year');
                    this._updateDate();
                    break;
                case 'year-suffix-style':
                    this._extension._yearSuffixStyle = settings.get_int('year-suffix-style');
                    this._updateDate();
                    break;
                case 'date-format':
                    this._extension._dateFormat = settings.get_string('date-format');
                    this._updateDate();
                    break;
                case 'date-offset':
                    this._extension._dateOffset = settings.get_int('date-offset');
                    this._updateDate();
                    break;
                case 'text-color':
                    this._extension._textColor = settings.get_string('text-color');
                    this._updateColor();
                    break;
                case 'use-theme-text-color':
                    this._extension._useThemeTextColor = settings.get_boolean('use-theme-text-color');
                    this._updateColor();
                    break;
                case 'calendar-text-color':
                    this._extension._calendarTextColor = settings.get_string('calendar-text-color');
                    this._updateCalendarColor();
                    break;
                case 'use-theme-calendar-text-color':
                    this._extension._useThemeCalendarTextColor = settings.get_boolean('use-theme-calendar-text-color');
                    this._updateCalendarColor();
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

    _addSettingsButton() {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.add_style_class_name('settings-button-item');

        settingsItem.connect('activate', () => {
            /* GNOME 40–44 */
            ExtensionUtils.openPrefs();
            this.menu.close();
        });

        this.menu.addMenuItem(settingsItem);
    }

    _addCalendar() {
        const calendarItem = new PopupMenu.PopupBaseMenuItem({
            activate: false,
            reactive: false,
            can_focus: false,
        });
        calendarItem.add_style_class_name('hijri-calendar-item');

        const calendarBox = new St.BoxLayout({
            vertical: true,
            style_class: 'hijri-calendar calendar popup-menu-item',
            x_expand: true,
        });
        calendarItem.add_child(calendarBox);
        this._calendarBox = calendarBox;

        this._calendarHeader = new St.BoxLayout({
            style_class: 'hijri-calendar-header-row',
            x_expand: true,
        });
        calendarBox.add_child(this._calendarHeader);

        this._calendarHeaderSpacer = new St.Widget({
            style_class: 'hijri-calendar-header-spacer',
        });
        this._calendarHeader.add_child(this._calendarHeaderSpacer);

        this._calendarHeaderCenter = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
        });
        this._calendarHeaderCenterBox = new St.BoxLayout({
            style_class: 'calendar-month-header',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarHeaderCenter.add_child(this._calendarHeaderCenterBox);
        this._calendarHeader.add_child(this._calendarHeaderCenter);

        this._calendarMonthLabel = new St.Label({
            style_class: 'hijri-calendar-header calendar-month-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarMonthButton = new St.Button({
            child: this._calendarMonthLabel,
            label_actor: this._calendarMonthLabel,
            style_class: 'hijri-calendar-header-button hijri-calendar-header-month',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        this._calendarMonthButton.connect('clicked', () => this._toggleMonthPicker());

        this._calendarYearLabel = new St.Label({
            style_class: 'hijri-calendar-header calendar-month-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarYearButton = new St.Button({
            child: this._calendarYearLabel,
            label_actor: this._calendarYearLabel,
            style_class: 'hijri-calendar-header-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        this._calendarYearButton.connect('clicked', () => this._toggleYearPicker());

        this._calendarHeaderCenterBox.add_child(this._calendarMonthButton);
        this._calendarHeaderCenterBox.add_child(this._calendarYearButton);

        this._calendarTodayButton = new St.Button({
            label: 'Today',
            style_class: 'hijri-calendar-today-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarTodayButton.connect('clicked', () => this._goToToday());
        this._calendarTodayButton.connect('notify::width', () => this._syncHeaderSpacer());
        this._calendarTodayButton.connect('style-changed', () => this._syncHeaderSpacer());
        this._calendarHeader.add_child(this._calendarTodayButton);
        this._syncHeaderSpacer();

        this._monthPickerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'hijri-calendar-picker',
            x_expand: true,
            visible: false,
        });
        this._monthPickerGridLayout = new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
        });
        this._monthPickerGridLayout.set_column_spacing(0);
        this._monthPickerGridLayout.set_row_spacing(0);

        this._monthPickerGrid = new St.Widget({
            layout_manager: this._monthPickerGridLayout,
            style_class: 'hijri-calendar-picker-grid',
            x_expand: true,
        });
        this._monthPickerBox.add_child(this._monthPickerGrid);
        calendarBox.add_child(this._monthPickerBox);

        this._yearPickerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'hijri-calendar-picker',
            x_expand: true,
            visible: false,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this._yearPickerBox.connect('scroll-event', this._onYearPickerScroll.bind(this));

        this._yearPickerList = new St.BoxLayout({
            vertical: true,
            style_class: 'hijri-calendar-year-list',
            x_expand: true,
        });
        this._yearPickerBox.add_child(this._yearPickerList);
        calendarBox.add_child(this._yearPickerBox);

        this._calendarGridLayout = new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
        });
        this._calendarGridLayout.set_column_spacing(0);
        this._calendarGridLayout.set_row_spacing(0);

        this._calendarGrid = new St.Widget({
            layout_manager: this._calendarGridLayout,
            style_class: 'hijri-calendar-grid',
            x_expand: true,
        });
        calendarBox.add_child(this._calendarGrid);

        this.menu.addMenuItem(calendarItem);
        this._updateCalendar();
        this._updateCalendarColor();
    }

    _syncHeaderSpacer() {
        const [, naturalWidth] = this._calendarTodayButton.get_preferred_width(-1);
        let width = naturalWidth;
        const themeNode = this._calendarTodayButton.get_theme_node();
        width += themeNode.get_margin(St.Side.LEFT) + themeNode.get_margin(St.Side.RIGHT);
        this._calendarHeaderSpacer.set_style(`width: ${Math.max(0, width)}px;`);
    }

    _hidePickers() {
        this._monthPickerBox.visible = false;
        this._yearPickerBox.visible = false;
    }

    _toggleMonthPicker() {
        const nextVisible = !this._monthPickerBox.visible;
        this._monthPickerBox.visible = nextVisible;
        if (nextVisible)
            this._yearPickerBox.visible = false;
        this._updateCalendar();
    }

    _toggleYearPicker() {
        const nextVisible = !this._yearPickerBox.visible;
        this._yearPickerBox.visible = nextVisible;
        if (nextVisible) {
            this._monthPickerBox.visible = false;
            this._yearPickerBaseYear = Number.isFinite(this._currentHijriYear)
                ? this._currentHijriYear
                : 1;
            this._yearPickerBaseYear = Math.min(
                Math.max(this._yearPickerBaseYear, this._yearRangeMin),
                this._yearRangeMax
            );
        }
        this._updateCalendar();
    }

    _goToToday() {
        this._viewDate = null;
        this._hidePickers();
        this._updateCalendar();
    }

    _setViewDateFromAdjusted(adjustedDate) {
        const offsetDays = this._extension._dateOffset || 0;
        this._viewDate = shiftDateByDays(adjustedDate, -offsetDays);
    }

    _getMonthStartAdjustedDate(adjustedDate, formatters) {
        let date = new Date(adjustedDate);
        let parts = getHijriNumericParts(date, formatters.numericParts);
        while (parts.day !== 1) {
            date.setDate(date.getDate() - 1);
            parts = getHijriNumericParts(date, formatters.numericParts);
        }
        return date;
    }

    _getNextHijriMonthStart(adjustedMonthStart, formatters) {
        let date = new Date(adjustedMonthStart);
        let parts = getHijriNumericParts(date, formatters.numericParts);
        const month = parts.month;
        const year = parts.year;
        do {
            date.setDate(date.getDate() + 1);
            parts = getHijriNumericParts(date, formatters.numericParts);
        } while (parts.month === month && parts.year === year);
        return date;
    }

    _getPrevHijriMonthStart(adjustedMonthStart, formatters) {
        let date = new Date(adjustedMonthStart);
        date.setDate(date.getDate() - 1);
        let parts = getHijriNumericParts(date, formatters.numericParts);
        while (parts.day !== 1) {
            date.setDate(date.getDate() - 1);
            parts = getHijriNumericParts(date, formatters.numericParts);
        }
        return date;
    }

    _getMonthStartDatesForYear(formatters, targetParts) {
        const starts = new Array(12);
        starts[targetParts.month - 1] = new Date(this._currentMonthStartAdjustedDate);

        let cursor = new Date(this._currentMonthStartAdjustedDate);
        for (let month = targetParts.month; month < 12; month++) {
            cursor = this._getNextHijriMonthStart(cursor, formatters);
            starts[month] = new Date(cursor);
        }

        cursor = new Date(this._currentMonthStartAdjustedDate);
        for (let month = targetParts.month; month > 1; month--) {
            cursor = this._getPrevHijriMonthStart(cursor, formatters);
            starts[month - 2] = new Date(cursor);
        }

        return starts;
    }

    _buildMonthPicker(formatters, targetParts) {
        const monthStarts = this._getMonthStartDatesForYear(formatters, targetParts);
        this._monthStartDates = monthStarts;

        this._monthPickerGrid.get_children().forEach(child => child.destroy());

        const cols = 3;
        const isArabic = this._extension._language === Language.ARABIC;
        for (let i = 0; i < monthStarts.length; i++) {
            const date = monthStarts[i];
            const label = new St.Label({
                text: date ? formatters.displayMonth.format(date) : '',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const button = new St.Button({
                child: label,
                label_actor: label,
                style_class: 'hijri-calendar-month-button',
                x_expand: true,
                can_focus: true,
            });
            if (i + 1 === targetParts.month)
                button.add_style_class_name('selected');
            button.connect('clicked', () => this._selectMonth(i));
            const column = isArabic ? (cols - 1) - (i % cols) : (i % cols);
            this._monthPickerGridLayout.attach(button, column, Math.floor(i / cols), 1, 1);
        }
        this._updateCalendarColor();
    }

    _renderYearPicker(formatters, selectedYear) {
        if (!Number.isFinite(this._yearPickerBaseYear))
            this._yearPickerBaseYear = selectedYear;

        const baseYear = Math.min(
            Math.max(this._yearPickerBaseYear, this._yearRangeMin),
            this._yearRangeMax
        );
        this._yearPickerBaseYear = baseYear;
        const start = Math.max(this._yearRangeMin, baseYear - this._yearPickerRange);
        const end = Math.min(this._yearRangeMax, baseYear + this._yearPickerRange);
        const yearFormatter = new Intl.NumberFormat(formatters.locale, {
            numberingSystem: formatters.numSys,
        });

        this._yearPickerList.get_children().forEach(child => child.destroy());

        for (let year = start; year <= end; year++) {
            const label = new St.Label({
                text: yearFormatter.format(year),
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const button = new St.Button({
                child: label,
                label_actor: label,
                style_class: 'hijri-calendar-year-button',
                x_expand: true,
                can_focus: true,
            });
            if (year === selectedYear)
                button.add_style_class_name('selected');
            button.connect('clicked', () => this._selectYear(year));
            this._yearPickerList.add_child(button);
        }
        this._updateCalendarColor();
    }

    _onYearPickerScroll(_actor, event) {
        if (!this._yearPickerBox.visible)
            return Clutter.EVENT_PROPAGATE;

        let delta = 0;
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                delta = -1;
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                delta = 1;
                break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [, dy] = event.get_scroll_delta();
                if (dy === 0)
                    return Clutter.EVENT_STOP;
                delta = dy > 0 ? 1 : -1;
                break;
            }
        }

        if (delta !== 0) {
            const baseYear = Number.isFinite(this._yearPickerBaseYear)
                ? this._yearPickerBaseYear
                : (Number.isFinite(this._currentHijriYear) ? this._currentHijriYear : 1);
            this._yearPickerBaseYear = Math.min(
                Math.max(baseYear + delta, this._yearRangeMin),
                this._yearRangeMax
            );
            const formatters = buildHijriFormatters(
                this._extension._language,
                this._extension._numberLanguage,
                this._extension._calendarMethod
            );
            this._renderYearPicker(formatters, this._currentHijriYear);
        }

        return Clutter.EVENT_STOP;
    }

    _selectMonth(monthIndex) {
        this._setViewDateFromAdjusted(this._monthStartDates[monthIndex]);
        this._hidePickers();
        this._updateCalendar();
    }

    _selectYear(year) {
        if (year < this._yearRangeMin || year > this._yearRangeMax)
            return;
        const offsetDays = this._extension._dateOffset || 0;
        const formatters = buildHijriFormatters(
            this._extension._language,
            this._extension._numberLanguage,
            this._extension._calendarMethod
        );
        const anchorAdjustedDate = this._currentAdjustedViewDate
            ? new Date(this._currentAdjustedViewDate)
            : shiftDateByDays(new Date(), offsetDays);
        const anchorParts = getHijriNumericParts(anchorAdjustedDate, formatters.numericParts);
        const targetMonth = this._currentHijriMonth || anchorParts.month;
        const targetDate = this._findAdjustedDateForHijriMonthYear(
            year,
            targetMonth,
            anchorAdjustedDate,
            formatters
        );
        if (!targetDate)
            return;
        this._setViewDateFromAdjusted(targetDate);
        this._hidePickers();
        this._updateCalendar();
    }

    _findAdjustedDateForHijriMonthYear(targetYear, targetMonth, anchorAdjustedDate, formatters) {
        let date = new Date(anchorAdjustedDate);
        let parts = getHijriNumericParts(date, formatters.numericParts);
        const forward = targetYear > parts.year ||
            (targetYear === parts.year && targetMonth > parts.month);
        const step = forward ? 1 : -1;
        let guard = 0;
        const maxSteps = Math.ceil((YEAR_RANGE_LIMIT + 2) * 370);

        while ((parts.year !== targetYear || parts.month !== targetMonth) && guard < maxSteps) {
            date.setDate(date.getDate() + step);
            parts = getHijriNumericParts(date, formatters.numericParts);
            guard++;
        }

        if (parts.year !== targetYear || parts.month !== targetMonth) {
            console.warn('Hijri calendar lookup exceeded safe range');
            return null;
        }

        while (parts.day !== 1 && guard < maxSteps) {
            date.setDate(date.getDate() - 1);
            parts = getHijriNumericParts(date, formatters.numericParts);
            guard++;
        }

        return date;
    }

    _updateCalendar() {
        const offsetDays = this._extension._dateOffset || 0;
        const baseDate = new Date();
        const viewDate = this._viewDate ? new Date(this._viewDate) : baseDate;
        const adjustedDate = shiftDateByDays(viewDate, offsetDays);
        const formatters = buildHijriFormatters(
            this._extension._language,
            this._extension._numberLanguage,
            this._extension._calendarMethod
        );

        const targetParts = getHijriNumericParts(adjustedDate, formatters.numericParts);
        this._currentAdjustedViewDate = new Date(adjustedDate);
        this._currentHijriMonth = targetParts.month;
        this._currentHijriYear = targetParts.year;

        const actualFirstDate = this._getMonthStartAdjustedDate(adjustedDate, formatters);
        this._currentMonthStartAdjustedDate = new Date(actualFirstDate);

        const firstOfDisplayDate = shiftDateByDays(actualFirstDate, -offsetDays);

        this._calendarMonthLabel.set_text(formatters.displayMonth.format(adjustedDate));
        const parts = formatters.displayYear.formatToParts(adjustedDate);
        let yearText = parts
            .filter(part => part.type === 'year')
            .map(part => part.value)
            .join('');
        if (!yearText) {
            yearText = formatters.displayYear.format(adjustedDate)
                .replace(/\bA\.?H\.?\b/gi, '')
                .replace(/[\u0647\u0640]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        this._calendarYearLabel.set_text(yearText);

        const anchorAdjustedDate = shiftDateByDays(baseDate, offsetDays);
        const anchorParts = getHijriNumericParts(anchorAdjustedDate, formatters.numericParts);
        this._yearRangeMin = Math.max(1, anchorParts.year - YEAR_RANGE_LIMIT);
        this._yearRangeMax = anchorParts.year + YEAR_RANGE_LIMIT;

        if (this._monthPickerBox.visible)
            this._buildMonthPicker(formatters, targetParts);
        if (this._yearPickerBox.visible)
            this._renderYearPicker(formatters, targetParts.year);

        /* Sunday-first grid (matches the 45-50 version of this extension).
         * The week always starts on Sunday regardless of locale, and the
         * layout is simple left-to-right (no RTL column mirror) — the same
         * approach used by the 45-50 build, where the Arabic weekday letters
         * render correctly. An earlier version mirrored columns with a
         * `6 - (7 + dow - weekStart) % 7` formula for RTL, but that scrambled
         * the Arabic heading letters; reverting to the simple LTR layout
         * fixes it. */
        const firstWeekday = firstOfDisplayDate.getDay();
        const gridStartDate = new Date(firstOfDisplayDate);
        gridStartDate.setDate(gridStartDate.getDate() - firstWeekday);

        this._calendarGrid.get_children().forEach(child => child.destroy());

        const weekLocale = buildHijriLocale(
            this._extension._weekLanguage,
            this._extension._calendarMethod
        );
        const weekdayFormatter = new Intl.DateTimeFormat(weekLocale, { weekday: 'narrow' });
        const weekdayLabels = [];
        const weekdayBase = new Date(1970, 0, 4); // Sunday
        for (let i = 0; i < 7; i++) {
            const weekdayDate = new Date(weekdayBase);
            weekdayDate.setDate(weekdayBase.getDate() + i);
            weekdayLabels.push(weekdayFormatter.format(weekdayDate));
        }

        /* Weekday heading labels.
         *
         * NOTE: we deliberately do NOT carry the stock GNOME classes
         * `calendar-day-base calendar-day-heading` here. The stock rule
         *   .calendar .calendar-day-base.calendar-day-heading { color: $insensitive_fg_color; }
         * pins the heading color to $insensitive_fg_color, which is
         * UNRELIABLE in third-party "light" shell themes (it compiles to
         * white/near-white and no theme override targets the long (0,3,0)
         * heading selector, so headings render white-on-white). By using only
         * our own `hijri-calendar-weekday` class, no stock color rule applies.
         * The heading then INHERITS the explicit `color` that
         * _updateCalendarColor() sets on the .hijri-calendar container
         * (calendarBox) — chosen by luminance against the actual popup
         * background, so it is readable in both light and dark themes
         * without depending on $fg_color or $insensitive_fg_color.
         *
         * The headings are attached left-to-right (column = index), matching
         * the 45-50 build; this is what makes the Arabic weekday letters
         * render in the correct order. */
        this._weekdayLabelActors = [];
        weekdayLabels.forEach((label, index) => {
            const dayLabel = new St.Label({
                text: label,
                style_class: 'hijri-calendar-weekday',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._calendarGridLayout.attach(dayLabel, index, 0, 1, 1);
            this._weekdayLabelActors.push(dayLabel);
        });

        for (let i = 0; i < 42; i++) {
            const cellDate = new Date(gridStartDate);
            cellDate.setDate(gridStartDate.getDate() + i);

            const displayDate = shiftDateByDays(cellDate, offsetDays);
            const cellParts = getHijriNumericParts(displayDate, formatters.numericParts);
            const isCurrentMonth = cellParts.month === targetParts.month &&
                cellParts.year === targetParts.year;
            const isToday = isSameDay(cellDate, baseDate);
            let styleClass = 'hijri-calendar-day calendar-day-base calendar-day';

            /* Use the extension's own calendar-weekday / calendar-weekend
             * classes (NOT the stock calendar-work-day / calendar-nonwork-day
             * classes). The stock .calendar-nonwork-day rule gives weekends a
             * different (muted) color via $insensitive_fg_color; we want
             * weekdays and weekends to share the SAME color, with only
             * current-month vs other-month differing. The custom classes
             * have no color rules in stylesheet.css, so both inherit the same
             * foreground from the calendar container. */
            if (isWorkDay(cellDate))
                styleClass += ' calendar-weekday';
            else
                styleClass += ' calendar-weekend';

            if (Math.floor(i / 7) === 0)
                styleClass = `calendar-day-top ${styleClass}`;

            const leftMost = this._calendarGrid.get_text_direction() === Clutter.TextDirection.RTL
                ? i % 7 === 6
                : i % 7 === 0;
            if (leftMost)
                styleClass = `calendar-day-left ${styleClass}`;

            const dayButton = new St.Button({
                label: formatters.displayDay.format(displayDate),
                style_class: styleClass,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                can_focus: false,
                reactive: false,
                track_hover: false,
            });

            if (!isCurrentMonth) {
                dayButton.add_style_class_name('other-month');
                dayButton.add_style_class_name('calendar-other-month-day');
            }
            if (isToday) {
                dayButton.add_style_class_name('today');
                dayButton.add_style_class_name('calendar-today');
            }

            this._calendarGridLayout.attach(dayButton, i % 7, Math.floor(i / 7) + 1, 1, 1);
        }
        this._updateCalendarColor();
    }

    _updateDate() {
        this.label.set_text(
            getHijriDate(
                this._extension._language,
                this._extension._numberLanguage,
                this._extension._calendarMethod,
                this._extension._showYear,
                this._extension._yearSuffixStyle,
                this._extension._dateFormat,
                this._extension._dateOffset
            )
        );
        this._updateCalendar();
    }

    _updateColor() {
        const style = this._extension._useThemeTextColor
            ? null
            : `color: ${this._extension._textColor};`;
        this.label.set_style(style);
    }

    _updateCalendarColor() {
        const customColor = this._extension._calendarTextColor;
        const usesCustomColor = !this._extension._useThemeCalendarTextColor &&
            /^#[0-9A-Fa-f]{6}$/.test(customColor);

        /* All calendar text actors that may carry a per-actor inline color.
         * The 7 weekday heading labels live in the same grid as the 42 day
         * buttons, so this._calendarGrid.get_children() covers them too. */
        const textActors = [
            this._calendarMonthLabel,
            this._calendarYearLabel,
            this._calendarTodayButton,
            ...this._monthPickerGrid.get_children(),
            ...this._yearPickerList.get_children(),
            ...this._calendarGrid.get_children(),
        ];

        if (usesCustomColor) {
            /* Toggle OFF: the user's chosen color is applied to every calendar
             * text actor EXCEPT "today"/"selected", which keep their native
             * accent foreground (white-on-accent) so they stay readable. */
            if (this._calendarBox)
                this._calendarBox.set_style(null);
            const style = `color: ${customColor};`;
            for (const actor of textActors) {
                const keepsNativeForeground =
                    actor.has_style_class_name &&
                    (actor.has_style_class_name('today') ||
                     actor.has_style_class_name('calendar-today') ||
                     actor.has_style_class_name('selected'));
                actor.set_style(keepsNativeForeground ? null : style);
            }
            return;
        }

        /* Toggle ON (default): behave like the stock GNOME calendar, i.e. be
         * READABLE in both light and dark shell themes.
         *
         * We CANNOT rely on inheriting $fg_color from .popup-menu: many
         * third-party "light" shell themes ship a dark-compiled CSS where
         * $fg_color is white, so every actor with no explicit `color` rule
         * (weekday headings, work-day numbers, the Today button, the month/
         * year labels) renders white-on-white. We also cannot rely on
         * $insensitive_fg_color: in those same themes it is unreliable.
         *
         * The robust, theme-agnostic fix: set ONE explicit `color` on the
         * common ancestor .hijri-calendar (calendarBox) and let every
         * descendant that has no explicit `color` rule of its own INHERIT it.
         * st_theme_node_get_foreground_color (st-theme-node.c) stops at the
         * first node that has an explicit `color` declaration and never walks
         * further up to the broken .popup-menu/$fg_color. Descendants WITH
         * their own explicit color (weekend .calendar-nonwork-day, other-month
         * .calendar-other-month-day, today .calendar-today) keep their own
         * already-readable colors and are untouched.
         *
         * The color we set reproduces the STOCK $fg_color exactly in correct
         * themes — light variant: transparentize(black, 0.2) = rgba(0,0,0,0.8);
         * dark variant: white = rgba(255,255,255,1) — and we pick the right
         * member of the pair from the ACTUAL rendered popup background
         * luminance, so the choice never depends on $fg_color or
         * $insensitive_fg_color being correct. In a correct theme this is a
         * no-op visually; in a broken theme it makes the calendar readable. */
        for (const actor of textActors)
            actor.set_style(null);

        const fgColor = this._computeReadableForeground(this._calendarBox);
        if (fgColor && this._calendarBox)
            this._calendarBox.set_style(`color: ${fgColor};`);
        /* If fgColor is null the actors are not staged yet (menu closed):
         * keep any previously set color and let the menu 'open-state-changed'
         * handler recompute once they are staged. */
    }

    /* Pick a foreground color that is readable against the actual popup
     * background, reproducing the stock $fg_color in correct themes.
     *
     * st_widget_get_theme_node() (st-widget.c) documents: "it is a fatal
     * error to call this on a widget that is not been added to a stage"; when
     * called unstaged it g_critical's and returns an empty node, so we guard
     * with get_stage() and bail out (return null) when not staged.
     *
     * st_theme_node_get_background_color(node, &color) reads a ClutterColor
     * (guint8 0-255 fields). calendarBox is a `card(flat)` -> transparent, so
     * we walk up the parent chain to the first effectively-opaque ancestor
     * (the .popup-menu-content) which paints the visible popup background. */
    _computeReadableForeground(actor) {
        if (!actor || !actor.get_stage())
            return null;

        let bg = null;
        let cur = actor;
        while (cur) {
            if (typeof cur.get_theme_node === 'function') {
                let c = null;
                try {
                    c = cur.get_theme_node().get_background_color();
                } catch (e) {
                    c = null;
                }
                if (c && c.alpha >= 128) {
                    bg = c;
                    break;
                }
            }
            cur = cur.get_parent();
        }
        if (!bg)
            return null;

        /* Relative luminance per WCAG. ClutterColor channels are 0-255 ints. */
        const channel = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92
                                : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * channel(bg.red) +
                  0.7152 * channel(bg.green) +
                  0.0722 * channel(bg.blue);

        /* 0.179 is the luminance at which black and white text have equal
         * contrast against the background. Above it the background is "light"
         * -> use the stock light $fg_color (rgba(0,0,0,0.8)); below it -> the
         * stock dark $fg_color (white). */
        return L >= 0.179 ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 1)';
    }

    destroy() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = 0;
        }
        if (this._menuOpenChangedId)
            this.menu.disconnect(this._menuOpenChangedId);
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
        this._weekLanguage   = Language.ENGLISH;
        this._numberLanguage = NumberLanguage.ENGLISH;
        this._calendarMethod = CalendarMethod.UMM_AL_QURA;
        this._showYear       = false;
        this._yearSuffixStyle= YearSuffixStyle.AH;
        this._dateFormat     = '{day} {month} {year} {suffix}';
        this._dateOffset     = 0;
        this._textColor      = '#ffffff';
        this._spacer         = null;
        this._settings       = null;
        this._centerPosition = CenterPosition.LEFT;
        this._centerBoxSignalIds = [];
        this._centerReorderId = 0;
    }

    enable() {
        this._settings = ExtensionUtils.getSettings();

        this._position        = this._settings.get_int('position');
        if (this._settings.settings_schema.has_key('center-position'))
            this._centerPosition = this._settings.get_int('center-position');
        this._spacing         = this._settings.get_int('spacing');
        this._language        = this._settings.get_int('language');
        this._weekLanguage    = this._settings.get_int('week-language');
        this._numberLanguage  = this._settings.get_int('number-language');
        this._calendarMethod  = this._settings.get_int('calendar-method');
        this._showYear        = this._settings.get_boolean('show-year');
        this._yearSuffixStyle = this._settings.get_int('year-suffix-style');
        this._dateFormat      = this._settings.get_string('date-format');
        this._dateOffset      = this._settings.get_int('date-offset');
        this._textColor       = this._settings.get_string('text-color');
        this._useThemeTextColor = this._settings.get_boolean('use-theme-text-color');
        this._calendarTextColor = this._settings.get_string('calendar-text-color');
        this._useThemeCalendarTextColor =
            this._settings.get_boolean('use-theme-calendar-text-color');

        this._addToPanel();
    }

    _addToPanel() {
        this._unwatchCenterBox();

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
                boxIndex = this._getCenterBoxIndex(
                    Main.panel._centerBox.get_n_children());
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

        if (this._position === Position.CENTER)
            this._watchCenterBox();
    }

    setPosition(position) {
        this._position = position;

        if (this._spacer && this._spacer.get_parent())
            this._spacer.get_parent().remove_child(this._spacer);

        this._addToPanel();
    }

    setCenterPosition(position) {
        if ([CenterPosition.MIDDLE_LEFT, CenterPosition.MIDDLE_RIGHT].includes(position) &&
            this._position === Position.CENTER &&
            this._getOtherCenterChildCount() < 2) {
            if (this._settings.settings_schema.has_key('center-position'))
                this._settings.set_int('center-position', this._centerPosition);
            return;
        }

        this._centerPosition = position;
        if (this._position === Position.CENTER)
            this._queueCenterReorder();
    }

    _getCenterBoxIndex(otherChildren) {
        switch (this._centerPosition) {
            case CenterPosition.RIGHT:
                return -1;
            case CenterPosition.MIDDLE_LEFT:
                return otherChildren < 2 ? 0 : Math.floor(otherChildren / 2);
            case CenterPosition.MIDDLE_RIGHT:
                return otherChildren < 2 ? -1 : Math.ceil(otherChildren / 2);
            case CenterPosition.LEFT:
            default:
                return 0;
        }
    }

    _getOtherCenterChildCount() {
        const centerBox = Main.panel._centerBox;
        return centerBox.get_children().filter(child =>
            child !== (this._indicator && this._indicator.container) &&
            child !== this._spacer).length;
    }

    _watchCenterBox() {
        const centerBox = Main.panel._centerBox;
        const queueReorder = () => this._queueCenterReorder();

        this._centerBoxSignalIds = [
            centerBox.connect('actor-added', queueReorder),
            centerBox.connect('actor-removed', queueReorder),
        ];
        this._queueCenterReorder();
    }

    _unwatchCenterBox() {
        if (this._centerReorderId) {
            GLib.Source.remove(this._centerReorderId);
            this._centerReorderId = 0;
        }
        const centerBox = Main.panel && Main.panel._centerBox;
        if (centerBox) {
            for (const signalId of this._centerBoxSignalIds)
                centerBox.disconnect(signalId);
        }
        this._centerBoxSignalIds = [];
    }

    _queueCenterReorder() {
        if (this._centerReorderId || this._position !== Position.CENTER)
            return;

        this._centerReorderId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._centerReorderId = 0;
            this._reorderCenterIndicator();
            return GLib.SOURCE_REMOVE;
        });
    }

    _reorderCenterIndicator() {
        const centerBox = Main.panel._centerBox;
        const container = this._indicator && this._indicator.container;
        if (!container || container.get_parent() !== centerBox)
            return;

        const children = centerBox.get_children();
        const currentIndex = children.indexOf(container);
        if (currentIndex < 0)
            return;

        const otherChildCount = this._getOtherCenterChildCount();
        if ([CenterPosition.MIDDLE_LEFT, CenterPosition.MIDDLE_RIGHT]
            .includes(this._centerPosition) && otherChildCount < 2)
            return;

        let targetIndex = this._getCenterBoxIndex(otherChildCount);
        if (targetIndex < 0)
            targetIndex = otherChildCount;

        const spacerFollowsIndicator = this._spacer &&
            this._spacer.get_parent() === centerBox &&
            children[currentIndex + 1] === this._spacer;
        if (targetIndex === currentIndex &&
            (!(this._spacer && this._spacer.get_parent()) || spacerFollowsIndicator))
            return;

        if (this._spacer && this._spacer.get_parent() === centerBox)
            centerBox.remove_child(this._spacer);
        centerBox.remove_child(container);
        centerBox.insert_child_at_index(container, targetIndex);
        if (this._spacer)
            centerBox.insert_child_at_index(this._spacer, targetIndex + 1);
    }

    _addSpacerToPanel(spacer) {
        this._spacer = spacer;

        let box;
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
        this._unwatchCenterBox();

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
// Called by GNOME Shell's legacy extension loader.
// eslint-disable-next-line no-unused-vars
function init() {
    ExtensionUtils.initTranslations();

    return new Extension40to44();
}
