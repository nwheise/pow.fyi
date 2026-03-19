import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { UnitsProvider } from '@/context/UnitsContext';
import { TimezoneProvider } from '@/context/TimezoneContext';
import { MiniSnowTimeline } from '@/components/MiniSnowTimeline';
import type { DailyMetrics, HourlyMetrics } from '@/types';

function makeDailyMetrics(date: string, snowfallSum: number): DailyMetrics {
  return {
    date,
    weatherCode: 73,
    temperatureMax: -2,
    temperatureMin: -10,
    apparentTemperatureMax: -5,
    apparentTemperatureMin: -15,
    uvIndexMax: 3,
    precipitationSum: 5,
    rainSum: 0,
    snowfallSum,
    precipitationProbabilityMax: 80,
    windSpeedMax: 20,
    windGustsMax: 35,
  };
}

function makeHourlyMetrics(time: string, snowfall: number): HourlyMetrics {
  return {
    time,
    temperature: -5,
    apparentTemperature: -10,
    relativeHumidity: 80,
    precipitation: snowfall > 0 ? 2 : 0,
    rain: 0,
    snowfall,
    precipitationProbability: snowfall > 0 ? 80 : 10,
    weatherCode: snowfall > 0 ? 73 : 3,
    windSpeed: 15,
    windDirection: 270,
    windGusts: 25,
    freezingLevelHeight: 1500,
  };
}

function makeHourlyDay(date: string, amSnow: number, pmSnow: number, overnightSnow: number): HourlyMetrics[] {
  const hours: HourlyMetrics[] = [];
  for (let h = 0; h < 24; h++) {
    const hStr = h.toString().padStart(2, '0');
    let snow = 0;
    if (h >= 6 && h < 12) snow = amSnow / 6;
    else if (h >= 12 && h < 18) snow = pmSnow / 6;
    else snow = overnightSnow / 12;
    hours.push(makeHourlyMetrics(`${date}T${hStr}:00`, snow));
  }
  return hours;
}

function renderMiniTimeline(
  pastDays: DailyMetrics[],
  forecastDays: DailyMetrics[],
  forecastHourly?: HourlyMetrics[],
  attributionMode?: 'calendar' | 'ski',
) {
  return render(
    <UnitsProvider>
      <TimezoneProvider>
        <MiniSnowTimeline pastDays={pastDays} forecastDays={forecastDays} forecastHourly={forecastHourly} attributionMode={attributionMode} />
      </TimezoneProvider>
    </UnitsProvider>,
  );
}

// Past 7 days
const pastDays = [
  makeDailyMetrics('2025-01-08', 5),
  makeDailyMetrics('2025-01-09', 0),
  makeDailyMetrics('2025-01-10', 12),
  makeDailyMetrics('2025-01-11', 3),
  makeDailyMetrics('2025-01-12', 0),
  makeDailyMetrics('2025-01-13', 8),
  makeDailyMetrics('2025-01-14', 2),
];

// Today + next 7 days
const forecastDays = [
  makeDailyMetrics('2025-01-15', 10),
  makeDailyMetrics('2025-01-16', 15),
  makeDailyMetrics('2025-01-17', 0),
  makeDailyMetrics('2025-01-18', 8),
  makeDailyMetrics('2025-01-19', 6),
  makeDailyMetrics('2025-01-20', 0),
  makeDailyMetrics('2025-01-21', 4),
  makeDailyMetrics('2025-01-22', 5),
];

beforeEach(() => {
  localStorage.clear();
});

describe('MiniSnowTimeline', () => {
  it('renders the component with accessible label', () => {
    renderMiniTimeline(pastDays, forecastDays);
    expect(screen.getByRole('figure')).toBeInTheDocument();
  });

  it('renders "Today" label', () => {
    renderMiniTimeline(pastDays, forecastDays);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders 15 columns total (7 past + 1 today + 7 future)', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const cols = container.querySelectorAll('.mini-timeline__col');
    expect(cols).toHaveLength(15);
  });

  it('renders past bars with past style', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const pastBars = container.querySelectorAll('.mini-timeline__bar--past');
    expect(pastBars).toHaveLength(7);
  });

  it('renders today bar with today style when no hourly data', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const todayBar = container.querySelector('.mini-timeline__bar--today');
    expect(todayBar).toBeInTheDocument();
    expect(todayBar!.style.height).not.toBe('0%');
  });

  it('shows today snowfall value with accent style', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const todayValue = container.querySelector('.mini-timeline__value--today');
    expect(todayValue).toBeInTheDocument();
    // 10cm = 3.9" (imperial default)
    expect(todayValue!.textContent).toBe('3.9');
  });

  it('shows 0 snowfall values instead of blank labels', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const values = Array.from(container.querySelectorAll('.mini-timeline__value')).map((el) => el.textContent?.trim());
    expect(values).toContain('0');
  });

  it('renders future bars with future style when no hourly data', () => {
    const { container } = renderMiniTimeline(pastDays, forecastDays);
    const futureBars = container.querySelectorAll('.mini-timeline__bar--future');
    expect(futureBars).toHaveLength(7);
  });

  it('handles empty past days gracefully', () => {
    const { container } = renderMiniTimeline([], forecastDays);
    expect(screen.getByText('Today')).toBeInTheDocument();
    const pastBars = container.querySelectorAll('.mini-timeline__bar--past');
    expect(pastBars).toHaveLength(0);
  });

  it('handles empty forecast days gracefully', () => {
    const { container } = renderMiniTimeline(pastDays, []);
    const cols = container.querySelectorAll('.mini-timeline__col');
    // Only past days
    expect(cols).toHaveLength(7);
  });

  it('only shows 7 future days even if more provided', () => {
    const extraForecast = [
      ...forecastDays,
      makeDailyMetrics('2025-01-23', 20),
      makeDailyMetrics('2025-01-24', 5),
    ];
    const { container } = renderMiniTimeline(pastDays, extraForecast);
    const cols = container.querySelectorAll('.mini-timeline__col');
    expect(cols).toHaveLength(15);
  });

  it('only uses last 7 past days even if more provided', () => {
    const extraPast = [
      makeDailyMetrics('2025-01-04', 1),
      makeDailyMetrics('2025-01-05', 2),
      makeDailyMetrics('2025-01-06', 3),
      makeDailyMetrics('2025-01-07', 4),
      ...pastDays,
    ];
    const { container } = renderMiniTimeline(extraPast, forecastDays);
    const pastBars = container.querySelectorAll('.mini-timeline__bar--past');
    expect(pastBars).toHaveLength(7);
  });

  describe('AM/PM/Overnight period sub-bars', () => {
    const forecastHourly = [
      ...makeHourlyDay('2025-01-15', 3, 4, 3),  // today
      ...makeHourlyDay('2025-01-16', 6, 6, 3),  // tomorrow
      ...makeHourlyDay('2025-01-17', 1, 0, 0),
      ...makeHourlyDay('2025-01-18', 0, 5, 3),
      ...makeHourlyDay('2025-01-19', 2, 0, 0),
      ...makeHourlyDay('2025-01-20', 0, 0, 4),
      ...makeHourlyDay('2025-01-21', 3, 1, 0),
      ...makeHourlyDay('2025-01-22', 0, 2, 1),
    ];

    it('renders AM/PM/Overnight sub-bars for days with snow', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays, forecastHourly);
      const amBars = container.querySelectorAll('.mini-timeline__bar--am');
      const pmBars = container.querySelectorAll('.mini-timeline__bar--pm');
      const overnightBars = container.querySelectorAll('.mini-timeline__bar--overnight');
      expect(amBars.length).toBe(8);
      expect(pmBars.length).toBe(8);
      expect(overnightBars.length).toBe(8);
    });

    it('renders today with period sub-bars and accent border', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays, forecastHourly);
      const todayCol = container.querySelector('.mini-timeline__col--today');
      expect(todayCol).toBeInTheDocument();
      const todayBorder = todayCol!.querySelector('.mini-timeline__track--today-border');
      expect(todayBorder).toBeInTheDocument();
      // No old-style today bar
      const solidToday = todayCol!.querySelector('.mini-timeline__bar--today');
      expect(solidToday).not.toBeInTheDocument();
    });

    it('falls back to single bars when no forecastHourly', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays);
      const amBars = container.querySelectorAll('.mini-timeline__bar--am');
      expect(amBars).toHaveLength(0);
      const todayBar = container.querySelector('.mini-timeline__bar--today');
      expect(todayBar).toBeInTheDocument();
    });

    it('past bars stay unchanged with hourly data', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays, forecastHourly);
      const pastBars = container.querySelectorAll('.mini-timeline__bar--past');
      expect(pastBars).toHaveLength(7);
    });
  });

  describe('Period legend', () => {
    it('renders the legend with AM, PM, and Night labels', () => {
      renderMiniTimeline(pastDays, forecastDays);
      expect(screen.getByText('AM')).toBeInTheDocument();
      expect(screen.getByText('PM')).toBeInTheDocument();
      expect(screen.getByText('Night')).toBeInTheDocument();
    });

    it('renders color swatches for each period', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays);
      expect(container.querySelector('.mini-timeline__legend-swatch--am')).toBeInTheDocument();
      expect(container.querySelector('.mini-timeline__legend-swatch--pm')).toBeInTheDocument();
      expect(container.querySelector('.mini-timeline__legend-swatch--overnight')).toBeInTheDocument();
    });

    it('legend has aria-label', () => {
      renderMiniTimeline(pastDays, forecastDays);
      expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    });

    it('legend items have hover tooltips explaining time ranges', () => {
      renderMiniTimeline(pastDays, forecastDays);
      expect(screen.getByTitle('AM \u2014 6 am to 12 pm')).toBeInTheDocument();
      expect(screen.getByTitle('PM \u2014 12 pm to 6 pm')).toBeInTheDocument();
      expect(screen.getByTitle('Night \u2014 6 pm to 6 am')).toBeInTheDocument();
    });
  });

  describe('Ski mode', () => {
    // Previous day (2025-01-14): heavy evening snow (overnightSnow=12 means h18-23 get 1cm/h = 6cm total)
    // Today (2025-01-15): amSnow=6, pmSnow=4, overnightSnow=8
    //   Ski overnight = prevDay h18-23 (6cm) + today h0-5 (4cm) + today h6-7 (2cm) = 12cm
    //   Ski daytime  = today h8-11 (4cm) + today h12-17 (4cm) = 8cm
    //   Ski total    = 20cm → 7.9" imperial
    //   Calendar snowfallSum = 18cm → 7.1" imperial
    const skiHourly = [
      ...makeHourlyDay('2025-01-14', 0, 0, 12),
      ...makeHourlyDay('2025-01-15', 6, 4, 8),
    ];

    // Use the normal forecastDays but override today with snowfallSum=18 (calendar total)
    const skiTodayForecast = [
      makeDailyMetrics('2025-01-15', 18),
      ...forecastDays.slice(1),
    ];

    it('renders "Overnight" and "Daytime" in the legend, not AM/PM/Night', () => {
      renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'ski');
      expect(screen.getByText('Overnight')).toBeInTheDocument();
      expect(screen.getByText('Daytime')).toBeInTheDocument();
      expect(screen.queryByText('AM')).not.toBeInTheDocument();
      expect(screen.queryByText('PM')).not.toBeInTheDocument();
      expect(screen.queryByText('Night')).not.toBeInTheDocument();
    });

    it('legend items have ski-mode tooltips', () => {
      renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'ski');
      expect(screen.getByTitle('Overnight \u2014 6 pm previous day to 8 am')).toBeInTheDocument();
      expect(screen.getByTitle('Daytime \u2014 8 am to 6 pm')).toBeInTheDocument();
    });

    it('shows ski-day attributed total for today (overnight + daytime, not calendar snowfallSum)', () => {
      const { container } = renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'ski');
      const todayValue = container.querySelector('.mini-timeline__value--today');
      // Ski total: 12cm overnight + 8cm daytime = 20cm = 7.9" imperial
      expect(todayValue!.textContent).toBe('7.9');
    });

    it('calendar mode still shows calendar-day total for today', () => {
      const { container } = renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'calendar');
      const todayValue = container.querySelector('.mini-timeline__value--today');
      // Calendar snowfallSum: 18cm = 7.1" imperial
      expect(todayValue!.textContent).toBe('7.1');
    });

    it('today column has period sub-bars with non-zero overnight and daytime heights in ski mode', () => {
      const { container } = renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'ski');
      const todayCol = container.querySelector('.mini-timeline__col--today');
      expect(todayCol!.querySelector('.mini-timeline__track--periods')).toBeInTheDocument();
      const overnightBar = todayCol!.querySelector('.mini-timeline__bar--overnight') as HTMLElement;
      expect(parseFloat(overnightBar.style.height)).toBeGreaterThan(0);
      // pm bar = daytime in ski mode
      const pmBar = todayCol!.querySelector('.mini-timeline__bar--pm') as HTMLElement;
      expect(parseFloat(pmBar.style.height)).toBeGreaterThan(0);
    });

    it('renders ski-mode period bars as overnight first then daytime', () => {
      const { container } = renderMiniTimeline(pastDays, skiTodayForecast, skiHourly, 'ski');
      const todayTrack = container.querySelector('.mini-timeline__col--today .mini-timeline__track--periods');
      const classes = Array.from(todayTrack!.children).map((el) => (el as HTMLElement).className);

      expect(classes).toEqual([
        'mini-timeline__bar mini-timeline__bar--overnight',
        'mini-timeline__bar mini-timeline__bar--pm',
      ]);
    });

    it('keeps calendar-mode period bar order as am, pm, overnight', () => {
      const { container } = renderMiniTimeline(pastDays, forecastDays, skiHourly, 'calendar');
      const todayTrack = container.querySelector('.mini-timeline__col--today .mini-timeline__track--periods');
      const classes = Array.from(todayTrack!.children).map((el) => (el as HTMLElement).className);

      expect(classes).toEqual([
        'mini-timeline__bar mini-timeline__bar--am',
        'mini-timeline__bar mini-timeline__bar--pm',
        'mini-timeline__bar mini-timeline__bar--overnight',
      ]);
    });
  });
});
