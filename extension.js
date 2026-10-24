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

const ThikrLanguage = { ENGLISH: 0 /* transliteration */, ARABIC: 1 };

/* Short adhkar, shown in Arabic or in English transliteration. */
const THIKR = [
    { ar: 'سبحان الله', en: 'SubhanAllah' },
    { ar: 'الحمد لله', en: 'Alhamdulillah' },
    { ar: 'الله أكبر', en: 'Allahu Akbar' },
    { ar: 'لا إله إلا الله', en: 'La ilaha illa Allah' },
    { ar: 'أستغفر الله', en: 'Astaghfirullah' },
    { ar: 'سبحان الله وبحمده', en: 'SubhanAllahi wa bihamdihi' },
    { ar: 'سبحان الله العظيم', en: 'SubhanAllahil Azim' },
    { ar: 'لا حول ولا قوة إلا بالله', en: 'La hawla wa la quwwata illa billah' },
    { ar: 'حسبنا الله ونعم الوكيل', en: 'HasbunAllahu wa ni\'mal wakil' },
    { ar: 'اللهم صل على محمد', en: 'Allahumma salli \'ala Muhammad' },
];

const DEFAULT_SPACING = 0;
const YEAR_RANGE_LIMIT = 200;
/* Fixed-width slot for the calendar header thikr; long ones wrap. Its height is
   that of the tallest thikr, so the popup keeps its size as the thikr changes. */
const THIKR_HEADER_WIDTH = 150;
/* Mean length of a Hijri month (30-year tabular cycle: 10631 days / 360 months). */
const MEAN_HIJRI_MONTH_DAYS = 10631 / 360;

/* Loading an extension stylesheet restyles every widget in the shell, so the
   popup's styles are loaded when it is first opened instead of on enable()
   (which also runs on every unlock). The panel button is styled inline. */
const POPUP_STYLESHEET = 'popup_menu.css';
const PANEL_BUTTON_STYLE = 'padding: 0 6px; transition-duration: 150ms;';
const PANEL_LABEL_STYLE = 'font-size: 14px; font-weight: bold; margin: 0; padding: 0;';

/* Constructing an Intl formatter costs far more than using it, and every
   calendar update asks for the same few. Created in enable(), dropped in disable(). */
let formatterCache = null;

function cachedIntl(Ctor, locale, options) {
    const key = `${Ctor.name}|${locale}|${JSON.stringify(options)}`;
    let fmt = formatterCache ? formatterCache.get(key) : null;
    if (!fmt) {
        fmt = new Ctor(locale, options);
        if (formatterCache)
            formatterCache.set(key, fmt);
    }
    return fmt;
}

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
    const fmt = cachedIntl(Intl.DateTimeFormat, locale, options);
    const calendar = fmt.resolvedOptions().calendar;
    if (calendar && calendar.startsWith('islamic'))
        return fmt;

    return cachedIntl(Intl.DateTimeFormat, fallbackLocale, options);
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

function panelLabelStyle(extension) {
    return extension._useThemeTextColor
        ? PANEL_LABEL_STYLE
        : `${PANEL_LABEL_STYLE} color: ${extension._textColor};`;
}

/* Natural width plus horizontal margins; call only for actors on stage. */
function outerWidth(actor) {
    const [, naturalWidth] = actor.get_preferred_width(-1);
    const themeNode = actor.get_theme_node();
    return naturalWidth + themeNode.get_margin(St.Side.LEFT) + themeNode.get_margin(St.Side.RIGHT);
}

function isSameHijriMonth(left, right) {
    return left.month === right.month && left.year === right.year;
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
        this.set_style(PANEL_BUTTON_STYLE);

        /* 40–44: menu.actor is valid */
        this.menu.actor.add_style_class_name('popup-menu-below-panel');
        this.menu.setSourceAlignment(0.5);

        /* The calendar is built the first time the menu opens. This handler
           must be connected before the separator is added: PopupMenu updates
           separator visibility in its own open-state-changed handler, and
           handlers run in connection order. */
        this._calendarDirty = false;
        this._calendarToday = null;
        this._popupStylesheetTheme = null;

        this._menuOpenChangedId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._ensureCalendar();
                this._updateCalendarColor();
            } else {
                this._hidePickers();
            }
        });

        this._addSettingsButton();

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
                    this._queueCalendarUpdate();
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
                case 'thikr-in-panel':
                case 'thikr-panel-position':
                case 'thikr-in-calendar':
                case 'thikr-language':
                case 'thikr-interval':
                    this._extension._syncThikr();
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
                this._updateLabel();
                if (this.menu.isOpen)
                    this._ensureCalendar();
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
            layout_manager: new Clutter.BinLayout(),
        });
        this._calendarHeader.add_child(this._calendarHeaderSpacer);

        this._calendarThikrLabel = new St.Label({
            style_class: 'hijri-calendar-thikr',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarThikrLabel.clutter_text.line_wrap = true;
        this._calendarThikrButton = new St.Button({
            child: this._calendarThikrLabel,
            label_actor: this._calendarThikrLabel,
            style_class: 'hijri-calendar-thikr-button',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            reactive: true,
            track_hover: true,
            visible: false,
        });
        this._calendarThikrButton.connect('clicked', () => this._extension.nextThikr());
        this._calendarHeaderSpacer.add_child(this._calendarThikrButton);

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
            label: _('Today'),
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
        /* Pads the Today side to the thikr's width so the month stays centred. */
        this._calendarHeaderEndPad = new St.Widget({ visible: false });
        this._calendarHeader.add_child(this._calendarHeaderEndPad);
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
        this._createCalendarCells();

        this.menu.addMenuItem(calendarItem, 0);
        this._updateCalendarThikr();
        this._updateCalendar();
    }

    /* Height of the tallest thikr at this width and font; cached until either changes. */
    _thikrSlotHeight(forWidth) {
        const label = this._calendarThikrLabel;
        const key = `${this._extension._thikrLanguage}|${forWidth}|${label.get_theme_node().get_font().to_string()}`;
        if (this._thikrSlotKey !== key) {
            const current = label.text;
            const heights = this._extension.getAllThikrTexts().map(text => {
                label.text = text;
                return this._calendarThikrButton.get_preferred_height(forWidth)[1];
            });
            label.text = current;
            this._thikrSlotHeightValue = Math.ceil(Math.max(...heights));
            this._thikrSlotKey = key;
        }
        return this._thikrSlotHeightValue;
    }

    _updateCalendarThikr() {
        if (!this._calendarThikrButton)
            return;
        const show = this._extension._thikrInCalendar;
        this._calendarThikrButton.visible = show;
        if (show)
            this._calendarThikrLabel.set_text(this._extension.getThikrText());
        this._syncHeaderSpacer();
    }

    _createCalendarCells() {
        this._weekdayLabels = [];
        for (let i = 0; i < 7; i++) {
            const dayLabel = new St.Label({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._calendarGridLayout.attach(dayLabel, i, 0, 1, 1);
            this._weekdayLabels.push(dayLabel);
        }

        this._dayButtons = [];
        for (let i = 0; i < 42; i++) {
            const dayButton = new St.Button({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                can_focus: false,
                reactive: false,
                track_hover: false,
            });
            this._calendarGridLayout.attach(dayButton, i % 7, Math.floor(i / 7) + 1, 1, 1);
            this._dayButtons.push(dayButton);
        }
    }

    _ensureCalendar() {
        this._loadPopupStylesheet();
        if (!this._calendarGrid)
            this._addCalendar();
        else if (this._calendarDirty || !isSameDay(this._calendarToday, new Date()))
            this._updateCalendar();
    }

    /* Settings changes while the menu is closed are applied when it next opens. */
    _queueCalendarUpdate() {
        this._calendarDirty = true;
        if (this.menu.isOpen)
            this._ensureCalendar();
    }

    _loadPopupStylesheet() {
        /* A shell theme change replaces the St.Theme and drops our stylesheet. */
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (theme === this._popupStylesheetTheme)
            return;
        try {
            theme.load_stylesheet(Me.dir.get_child(POPUP_STYLESHEET));
            this._popupStylesheetTheme = theme;
        } catch (e) {
            logError(e, 'Failed to load popup stylesheet');
        }
    }

    _syncHeaderSpacer() {
        /* Theme nodes only exist on stage; the notify::width and style-changed
           handlers run this again once the popup is shown. */
        if (!this._calendarTodayButton.get_stage())
            return;
        const todayWidth = Math.max(0, outerWidth(this._calendarTodayButton));
        const showThikr = this._calendarThikrButton.visible;
        const sideWidth = showThikr ? Math.max(todayWidth, THIKR_HEADER_WIDTH) : todayWidth;
        let style = `width: ${sideWidth}px;`;
        if (showThikr) {
            const node = this._calendarThikrButton.get_theme_node();
            const forWidth = sideWidth - node.get_margin(St.Side.LEFT) - node.get_margin(St.Side.RIGHT);
            style += ` min-height: ${this._thikrSlotHeight(forWidth)}px;`;
        }
        this._calendarHeaderSpacer.set_style(style);
        this._calendarHeaderEndPad.visible = sideWidth > todayWidth;
        this._calendarHeaderEndPad.set_style(`width: ${sideWidth - todayWidth}px;`);
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

    /* Hijri and Gregorian days line up one to one, so the month starts
       (day - 1) days back. A month starts where the month number changes, not
       where the day reads 1: ICU's astronomical 'islamic' calendar has months
       numbered from day 2, hence the forward correction. */
    _getMonthStartAdjustedDate(adjustedDate, formatters) {
        const parts = getHijriNumericParts(adjustedDate, formatters.numericParts);
        let date = shiftDateByDays(adjustedDate, 1 - parts.day);
        for (let guard = 0; guard < 3; guard++) {
            if (isSameHijriMonth(getHijriNumericParts(date, formatters.numericParts), parts))
                break;
            date = shiftDateByDays(date, 1);
        }
        return date;
    }

    /* Hijri months have 29 or 30 days, so 29 days after a month start is in
       the next month or on this month's last day. */
    _getNextHijriMonthStart(adjustedMonthStart, formatters) {
        const startParts = getHijriNumericParts(adjustedMonthStart, formatters.numericParts);
        let date = shiftDateByDays(adjustedMonthStart, 29);
        for (let guard = 0; guard < 3; guard++) {
            if (!isSameHijriMonth(getHijriNumericParts(date, formatters.numericParts), startParts))
                break;
            date = shiftDateByDays(date, 1);
        }
        return this._getMonthStartAdjustedDate(date, formatters);
    }

    _getPrevHijriMonthStart(adjustedMonthStart, formatters) {
        return this._getMonthStartAdjustedDate(
            shiftDateByDays(adjustedMonthStart, -1), formatters);
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
        const yearFormatter = cachedIntl(Intl.NumberFormat, formatters.locale, {
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

    /* Jump by the mean month length to the middle of the target month, then
       correct. Aiming mid-month keeps a day or two of drift from landing in a
       neighbouring month; it converges in one or two steps over the full range. */
    _findAdjustedDateForHijriMonthYear(targetYear, targetMonth, anchorAdjustedDate, formatters) {
        let date = new Date(anchorAdjustedDate);
        for (let guard = 0; guard < 10; guard++) {
            const parts = getHijriNumericParts(date, formatters.numericParts);
            const monthDelta = (targetYear - parts.year) * 12 + (targetMonth - parts.month);
            if (monthDelta === 0)
                return this._getMonthStartAdjustedDate(date, formatters);
            date = shiftDateByDays(date,
                (1 - parts.day) + Math.round(monthDelta * MEAN_HIJRI_MONTH_DAYS) + 14);
        }

        log('Hijri calendar lookup did not converge');
        return null;
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

        const firstWeekday = firstOfDisplayDate.getDay();
        const gridStartDate = new Date(firstOfDisplayDate);
        gridStartDate.setDate(gridStartDate.getDate() - firstWeekday);

        const weekLocale = buildHijriLocale(
            this._extension._weekLanguage,
            this._extension._calendarMethod
        );
        const weekdayFormatter = cachedIntl(Intl.DateTimeFormat, weekLocale, { weekday: 'narrow' });
        const arabicWeekdays = this._extension._weekLanguage === Language.ARABIC;
        const weekdayBase = new Date(1970, 0, 4); // Sunday
        this._weekdayLabels.forEach((dayLabel, i) => {
            dayLabel.set_text(weekdayFormatter.format(shiftDateByDays(weekdayBase, i)));
            dayLabel.set_style_class_name(arabicWeekdays
                ? 'hijri-calendar-weekday hijri-calendar-weekday-arabic'
                : 'hijri-calendar-weekday');
        });

        const rtl = this._calendarGrid.get_text_direction() === Clutter.TextDirection.RTL;
        this._dayButtons.forEach((dayButton, i) => {
            const cellDate = shiftDateByDays(gridStartDate, i);
            const displayDate = shiftDateByDays(cellDate, offsetDays);
            const cellParts = getHijriNumericParts(displayDate, formatters.numericParts);
            const isCurrentMonth = cellParts.month === targetParts.month &&
                cellParts.year === targetParts.year;
            const isToday = isSameDay(cellDate, baseDate);
            let styleClass = 'hijri-calendar-day calendar-day-base calendar-day';

            if (Math.floor(i / 7) === 0)
                styleClass = `calendar-day-top ${styleClass}`;

            const leftMost = rtl ? i % 7 === 6 : i % 7 === 0;
            if (leftMost)
                styleClass = `calendar-day-left ${styleClass}`;

            if (!isCurrentMonth)
                styleClass += ' other-month calendar-other-month-day';
            if (isToday)
                styleClass += ' today calendar-today';

            dayButton.set_style_class_name(styleClass);
            dayButton.set_label(formatters.displayDay.format(displayDate));
        });

        this._calendarToday = baseDate;
        this._calendarDirty = false;
        this._updateCalendarColor();
    }

    _updateLabel() {
        const text = getHijriDate(
            this._extension._language,
            this._extension._numberLanguage,
            this._extension._calendarMethod,
            this._extension._showYear,
            this._extension._yearSuffixStyle,
            this._extension._dateFormat,
            this._extension._dateOffset
        );
        if (this.label.text !== text)
            this.label.set_text(text);
    }

    _updateDate() {
        this._updateLabel();
        this._queueCalendarUpdate();
    }

    _updateColor() {
        this.label.set_style(panelLabelStyle(this._extension));
        if (this._extension._thikrIndicator)
            this._extension._thikrIndicator.update();
    }

    _updateCalendarColor() {
        if (!this._calendarGrid)
            return;
        const customColor = this._extension._calendarTextColor;
        const usesCustomColor = !this._extension._useThemeCalendarTextColor &&
            /^#[0-9A-Fa-f]{6}$/.test(customColor);

        const textActors = [
            this._calendarMonthLabel,
            this._calendarYearLabel,
            this._calendarTodayButton,
            this._calendarThikrButton,
            ...this._monthPickerGrid.get_children(),
            ...this._yearPickerList.get_children(),
            ...this._calendarGrid.get_children(),
        ];

        if (usesCustomColor) {
            if (this._calendarBox)
                this._calendarBox.set_style(null);
            const style = `color: ${customColor};`;
            for (const actor of textActors) {
                const keepsNativeForeground =
                    actor.has_style_class_name('today') ||
                     actor.has_style_class_name('calendar-today') ||
                     actor.has_style_class_name('selected');
                actor.set_style(keepsNativeForeground ? null : style);
            }
            return;
        }

        for (const actor of textActors)
            actor.set_style(null);

        const fgColor = this._computeReadableForeground(this._calendarBox);
        if (fgColor && this._calendarBox)
            this._calendarBox.set_style(`color: ${fgColor};`);
    }

    // Choose a readable foreground from the first opaque ancestor background.
    _computeReadableForeground(actor) {
        if (!actor || !actor.get_stage())
            return null;

        let bg = null;
        let cur = actor;
        while (cur) {
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
            cur = cur.get_parent();
        }
        if (!bg)
            return null;

        const channel = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92
                                : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * channel(bg.red) +
                  0.7152 * channel(bg.green) +
                  0.0722 * channel(bg.blue);

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
        if (this._popupStylesheetTheme)
            this._popupStylesheetTheme.unload_stylesheet(Me.dir.get_child(POPUP_STYLESHEET));
        this._popupStylesheetTheme = null;

        PanelMenu.Button.prototype.destroy.call(this);
    }
});

/* ----- Thikr button ------------------------------------------------------- */

/* Optional top-bar thikr; clicking it shows the next one. */
const ThikrButton = GObject.registerClass(
class ThikrButtonClass extends PanelMenu.Button {
    _init(extension) {
        PanelMenu.Button.prototype._init.call(this, 0.5, _('Thikr'), true);
        this._extension = extension;
        this.set_style(PANEL_BUTTON_STYLE);
        this.label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'hijri-thikr-label',
        });
        this.label_actor = this.label;
        this.add_child(this.label);
        this.update();
    }

    update() {
        this.label.set_text(this._extension.getThikrText());
        this.label.set_style(panelLabelStyle(this._extension));
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
            this._extension.nextThikr();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
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
        this._thikrIndicator = null;
        this._thikrTimerId   = 0;
        this._thikrIndex     = 0;
    }

    enable() {
        formatterCache = new Map();
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
        this._thikrIndex = Math.floor(Math.random() * THIKR.length);
        this._syncThikr();
    }

    getAllThikrTexts() {
        return THIKR.map(thikr => (this._thikrLanguage === ThikrLanguage.ARABIC ? thikr.ar : thikr.en));
    }

    getThikrText() {
        const thikr = THIKR[this._thikrIndex];
        return this._thikrLanguage === ThikrLanguage.ARABIC ? thikr.ar : thikr.en;
    }

    nextThikr() {
        this._thikrIndex = (this._thikrIndex + 1) % THIKR.length;
        if (this._thikrIndicator)
            this._thikrIndicator.update();
        if (this._indicator)
            this._indicator._updateCalendarThikr();
    }

    /* Applies the thikr settings: panel button, rotation timer and calendar label. */
    _syncThikr() {
        this._thikrInPanel    = this._settings.get_boolean('thikr-in-panel');
        this._thikrInCalendar = this._settings.get_boolean('thikr-in-calendar');
        this._thikrLanguage   = this._settings.get_int('thikr-language');

        this._removeThikr();
        if (this._thikrInPanel) {
            this._thikrIndicator = new ThikrButton(this);
            const position = this._settings.get_int('thikr-panel-position');
            const boxIndex = [Position.FAR_LEFT, Position.RIGHT].includes(position) ? 0 : -1;
            Main.panel.addToStatusArea('hijri-thikr', this._thikrIndicator,
                position === Position.CENTER ? 0 : boxIndex, this._getBoxPosition(position));
        }
        if (this._thikrInPanel || this._thikrInCalendar) {
            const minutes = Math.max(1, this._settings.get_int('thikr-interval'));
            this._thikrTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, minutes * 60, () => {
                this.nextThikr();
                return GLib.SOURCE_CONTINUE;
            });
        }
        if (this._indicator)
            this._indicator._updateCalendarThikr();
    }

    _removeThikr() {
        if (this._thikrTimerId) {
            GLib.Source.remove(this._thikrTimerId);
            this._thikrTimerId = 0;
        }
        if (this._thikrIndicator) {
            this._thikrIndicator.destroy();
            this._thikrIndicator = null;
        }
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
        this._removeThikr();
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
        formatterCache = null;
    }
}

/* GNOME 40–44 entry points */
// Called by GNOME Shell's legacy extension loader.
// eslint-disable-next-line no-unused-vars
function init() {
    ExtensionUtils.initTranslations();

    return new Extension40to44();
}
