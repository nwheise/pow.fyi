import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { UnitsProvider } from '@/context/UnitsContext';
import { TimezoneProvider } from '@/context/TimezoneContext';
import { SnowTimeline } from '@/components/SnowTimeline';
import {
  splitDayPeriods,
  splitSnowAttributionPeriods,
  type SnowAttributionMode,
} from '@/components/snowTimelinePeriods';
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

/** Generate 24 hourly entries for a date with snowfall in specific periods */
function makeHourlyDay(date: string, amSnow: number, pmSnow: number, overnightSnow: number): HourlyMetrics[] {
  const hours: HourlyMetrics[] = [];
  for (let h = 0; h < 24; h++) {
    const hStr = h.toString().padStart(2, '0');
    let snow = 0;
    if (h >= 6 && h < 12) snow = amSnow / 6;          // AM: spread across 6 hours
    else if (h >= 12 && h < 18) snow = pmSnow / 6;     // PM: spread across 6 hours
    else snow = overnightSnow / 12;                     // Overnight: 0-5 + 18-23 = 12 hours
    hours.push(makeHourlyMetrics(`${date}T${hStr}:00`, snow));
  }
  return hours;
}

function renderTimeline(
  recentDays: DailyMetrics[],
  forecastDays: DailyMetrics[],
  forecastHourly?: HourlyMetrics[],
  attributionMode?: SnowAttributionMode,
) {
  return render(
    <UnitsProvider>
      <TimezoneProvider>
        <SnowTimeline
          recentDays={recentDays}
          forecastDays={forecastDays}
          forecastHourly={forecastHourly}
          attributionMode={attributionMode}
        />
      </TimezoneProvider>
    </UnitsProvider>,
  );
}

const recentDays = [
  makeDailyMetrics('2025-01-08', 5),
  makeDailyMetrics('2025-01-09', 0),
  makeDailyMetrics('2025-01-10', 12),
  makeDailyMetrics('2025-01-11', 3),
  makeDailyMetrics('2025-01-12', 0),
  makeDailyMetrics('2025-01-13', 8),
  makeDailyMetrics('2025-01-14', 2),
];

const forecastDays = [
  makeDailyMetrics('2025-01-15', 10),
  makeDailyMetrics('2025-01-16', 15),
  makeDailyMetrics('2025-01-17', 0),
  makeDailyMetrics('2025-01-18', 5),
  makeDailyMetrics('2025-01-19', 20),
  makeDailyMetrics('2025-01-20', 0),
  makeDailyMetrics('2025-01-21', 3),
];

beforeEach(() => {
  localStorage.clear();
});

describe('SnowTimeline', () => {
  it('splits overnight as target-day evening plus next-day early morning', () => {
    const hourly: HourlyMetrics[] = [
      makeHourlyMetrics('2025-01-15T02:00', 10), // same-day early morning: should NOT count for 2025-01-15 overnight
      makeHourlyMetrics('2025-01-15T07:00', 1),  // AM
      makeHourlyMetrics('2025-01-15T13:00', 2), // PM
      makeHourlyMetrics('2025-01-15T20:00', 3), // same-day evening: should count for overnight
      makeHourlyMetrics('2025-01-16T01:00', 4), // next-day early morning: should count for overnight
      makeHourlyMetrics('2025-01-16T08:00', 6), // next-day AM: should not count for 2025-01-15
    ];

    const periods = splitDayPeriods('2025-01-15', hourly);
    expect(periods.am).toBe(1);
    expect(periods.pm).toBe(2);
    expect(periods.overnight).toBe(7);
  });

  it('hours 0-5 of target day belong to previous day overnight, not target day', () => {
    // Snow at 3 AM on Jan 16 should count for Jan 15's overnight, not Jan 16's periods
    const hourly: HourlyMetrics[] = [
      makeHourlyMetrics('2025-01-16T03:00', 5),  // should be Jan 15 overnight
      makeHourlyMetrics('2025-01-16T09:00', 2),  // Jan 16 AM
    ];

    // For Jan 16: the 3 AM snow should NOT appear in any bucket
    const jan16 = splitDayPeriods('2025-01-16', hourly);
    expect(jan16.am).toBe(2);
    expect(jan16.pm).toBe(0);
    expect(jan16.overnight).toBe(0);

    // For Jan 15: the 3 AM snow on Jan 16 SHOULD appear in overnight
    const jan15 = splitDayPeriods('2025-01-15', hourly);
    expect(jan15.am).toBe(0);
    expect(jan15.pm).toBe(0);
    expect(jan15.overnight).toBe(5);
  });

  it('supports calendar day attribution windows', () => {
    const hourly: HourlyMetrics[] = [
      makeHourlyMetrics('2025-01-15T19:00', 3),
      makeHourlyMetrics('2025-01-16T02:00', 5),
      makeHourlyMetrics('2025-01-16T09:00', 7),
      makeHourlyMetrics('2025-01-16T20:00', 11),
    ];

    const periods = splitSnowAttributionPeriods('2025-01-16', hourly, 'calendar');
    expect(periods.map((period) => period.label)).toEqual(['Morning', 'Day', 'Night']);
    expect(periods.map((period) => period.snowfall)).toEqual([5, 7, 11]);
  });

  it('supports ski day attribution windows', () => {
    const hourly: HourlyMetrics[] = [
      makeHourlyMetrics('2025-01-15T19:00', 3),
      makeHourlyMetrics('2025-01-16T02:00', 5),
      makeHourlyMetrics('2025-01-16T09:00', 7),
      makeHourlyMetrics('2025-01-16T20:00', 11),
    ];

    const periods = splitSnowAttributionPeriods('2025-01-16', hourly, 'ski');
    expect(periods.map((period) => period.label)).toEqual(['Overnight', 'Daytime']);
    expect(periods.map((period) => period.snowfall)).toEqual([8, 7]);
  });

  it('uses attributed hourly totals for displayed day totals and next-7d total in ski mode', () => {
    const skiForecastDays = [
      makeDailyMetrics('2025-01-16', 99),
      makeDailyMetrics('2025-01-17', 99),
    ];
    const skiHourly = [
      makeHourlyMetrics('2025-01-15T19:00', 3),
      makeHourlyMetrics('2025-01-16T02:00', 5),
      makeHourlyMetrics('2025-01-16T09:00', 7),
      makeHourlyMetrics('2025-01-16T20:00', 11),
      makeHourlyMetrics('2025-01-17T03:00', 13),
      makeHourlyMetrics('2025-01-17T09:00', 17),
    ];

    const { container } = renderTimeline([], skiForecastDays, skiHourly, 'ski');
    const totalValues = container.querySelectorAll('.snow-timeline__total-value');
    expect(totalValues[1]?.textContent).toBe('22.0"');

    const todayValue = container.querySelector('.snow-timeline__bar-value--today');
    expect(todayValue?.textContent).toBe('5.9');

    const futureValue = container.querySelector('.snow-timeline__section--future .snow-timeline__bar-value');
    expect(futureValue?.textContent).toBe('16.1');
  });

  it('renders the component with accessible label', () => {
    renderTimeline(recentDays, forecastDays);
    expect(screen.getByRole('figure')).toBeInTheDocument();
  });

  it('renders the today divider', () => {
    renderTimeline(recentDays, forecastDays);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders past 7d and next 7d labels', () => {
    renderTimeline(recentDays, forecastDays);
    expect(screen.getByText('Past 7d')).toBeInTheDocument();
    expect(screen.getByText('Next 7d')).toBeInTheDocument();
  });

  it('renders totals for past and future', () => {
    renderTimeline(recentDays, forecastDays);
    // Past total: 5+0+12+3+0+8+2 = 30cm = 11.8"
    // Future total: 10+15+0+5+20+0+3 = 53cm = 20.9"
    // Verify both total values are rendered
    const { container } = renderTimeline(recentDays, forecastDays);
    const totalValues = container.querySelectorAll('.snow-timeline__total-value');
    expect(totalValues).toHaveLength(2);
  });

  it('renders 13 bar columns (7 past + 6 future) plus today', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const barCols = container.querySelectorAll('.snow-timeline__bar-col');
    expect(barCols).toHaveLength(13);
    const todayBar = container.querySelector('.snow-timeline__today');
    expect(todayBar).toBeInTheDocument();
  });

  it('renders past bars with past style', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const pastBars = container.querySelectorAll('.snow-timeline__bar--past');
    expect(pastBars.length).toBe(7);
  });

  it('renders future bars with future style', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const futureBars = container.querySelectorAll('.snow-timeline__bar--future');
    expect(futureBars.length).toBe(6);
  });

  it('renders today bar with today style when snowfall > 0 (no hourly data)', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const todayBar = container.querySelector('.snow-timeline__bar--today');
    expect(todayBar).toBeInTheDocument();
    // forecastDays[0] has 10cm snow = 3.9" in imperial
    expect(todayBar!.style.height).not.toBe('0%');
  });

  it('shows today snowfall value', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const todayValue = container.querySelector('.snow-timeline__bar-value--today');
    expect(todayValue).toBeInTheDocument();
    // 10cm = 3.9" (imperial default)
    expect(todayValue!.textContent).toBe('3.9');
  });

  it('shows 0 snowfall values instead of blank labels', () => {
    const { container } = renderTimeline(recentDays, forecastDays);
    const values = Array.from(container.querySelectorAll('.snow-timeline__bar-value')).map((el) => el.textContent?.trim());
    expect(values).toContain('0');
  });

  it('handles empty recent days gracefully', () => {
    renderTimeline([], forecastDays);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('handles empty forecast days gracefully', () => {
    renderTimeline(recentDays, []);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('limits to 7 past days even if more provided', () => {
    const extraPast = [
      makeDailyMetrics('2025-01-06', 1),
      makeDailyMetrics('2025-01-07', 2),
      ...recentDays,
    ];
    const { container } = renderTimeline(extraPast, forecastDays);
    const pastBars = container.querySelectorAll('.snow-timeline__bar--past');
    expect(pastBars.length).toBe(7);
  });

  describe('AM/PM/Overnight period sub-bars', () => {
    // Build hourly data for the forecast days with specific period snow
    const forecastHourly = [
      // Today (2025-01-15): doesn't affect future bars
      ...makeHourlyDay('2025-01-15', 3, 4, 3),
      // 2025-01-16: 6cm AM, 6cm PM, 3cm overnight = 15cm total
      ...makeHourlyDay('2025-01-16', 6, 6, 3),
      // 2025-01-17: no snow
      ...makeHourlyDay('2025-01-17', 0, 0, 0),
      // 2025-01-18: 0 AM, 5 PM, 0 overnight = 5cm total
      ...makeHourlyDay('2025-01-18', 0, 5, 0),
      // 2025-01-19: 10 AM, 0 PM, 10 overnight = 20cm total
      ...makeHourlyDay('2025-01-19', 10, 0, 10),
      // 2025-01-20: no snow
      ...makeHourlyDay('2025-01-20', 0, 0, 0),
      // 2025-01-21: 3cm in AM only
      ...makeHourlyDay('2025-01-21', 3, 0, 0),
    ];

    it('renders AM/PM/Overnight sub-bars for today + future days with hourly data', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      const amBars = container.querySelectorAll('.snow-timeline__bar--am');
      const pmBars = container.querySelectorAll('.snow-timeline__bar--pm');
      const overnightBars = container.querySelectorAll('.snow-timeline__bar--overnight');
      // Days with snow: today (2025-01-15) + 2025-01-16, 2025-01-18, 2025-01-19, 2025-01-21 = 5 days
      expect(amBars.length).toBe(5);
      expect(pmBars.length).toBe(5);
      expect(overnightBars.length).toBe(5);
    });

    it('does not render old-style future bars when period data is present', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      // Days with zero snow across all periods still get old-style bar
      const futureBars = container.querySelectorAll('.snow-timeline__bar--future');
      // 2025-01-17 and 2025-01-20 have 0 snow everywhere → old-style bar
      expect(futureBars.length).toBe(2);
    });

    it('shows period tooltips with current period labels', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      const amBar = container.querySelector('.snow-timeline__bar--am');
      expect(amBar).toBeInTheDocument();
      expect(amBar!.getAttribute('title')).toContain('Morning snow');
      const pmBar = container.querySelector('.snow-timeline__bar--pm');
      expect(pmBar!.getAttribute('title')).toContain('Day snow');
      const nightBar = container.querySelector('.snow-timeline__bar--overnight');
      expect(nightBar!.getAttribute('title')).toContain('Night snow');
    });

    it('uses periods track layout for days with snow', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      const periodsTracks = container.querySelectorAll('.snow-timeline__bar-track--periods');
      expect(periodsTracks.length).toBe(5); // today + 4 future days with snow in at least one period
    });

    it('renders today bar with period sub-bars when hourly data present', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      const todaySection = container.querySelector('.snow-timeline__today');
      expect(todaySection).toBeInTheDocument();
      // Should have period track with today highlight border
      const todayPeriodTrack = todaySection!.querySelector('.snow-timeline__bar-track--today');
      expect(todayPeriodTrack).toBeInTheDocument();
      // Should NOT have old-style single today bar
      const oldTodayBar = todaySection!.querySelector('.snow-timeline__bar--today');
      expect(oldTodayBar).not.toBeInTheDocument();
    });

    it('today bar falls back to single bar when no hourly data', () => {
      const { container } = renderTimeline(recentDays, forecastDays);
      const todaySection = container.querySelector('.snow-timeline__today');
      const oldTodayBar = todaySection!.querySelector('.snow-timeline__bar--today');
      expect(oldTodayBar).toBeInTheDocument();
      const todayPeriodTrack = todaySection!.querySelector('.snow-timeline__bar-track--today');
      expect(todayPeriodTrack).not.toBeInTheDocument();
    });

    it('falls back to single bars when no forecastHourly', () => {
      const { container } = renderTimeline(recentDays, forecastDays);
      const futureBars = container.querySelectorAll('.snow-timeline__bar--future');
      expect(futureBars.length).toBe(6);
      const todayBar = container.querySelector('.snow-timeline__bar--today');
      expect(todayBar).toBeInTheDocument();
      const amBars = container.querySelectorAll('.snow-timeline__bar--am');
      expect(amBars.length).toBe(0);
    });

    it('past bars remain unchanged with period data present', () => {
      const { container } = renderTimeline(recentDays, forecastDays, forecastHourly);
      const pastBars = container.querySelectorAll('.snow-timeline__bar--past');
      expect(pastBars.length).toBe(7);
    });
  });

  describe('Period legend', () => {
    it('renders the legend with Morning, Day, and Night labels by default', () => {
      renderTimeline(recentDays, forecastDays);
      expect(screen.getByText('Morning')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(screen.getByText('Night')).toBeInTheDocument();
    });

    it('renders color swatches for each period', () => {
      const { container } = renderTimeline(recentDays, forecastDays);
      expect(container.querySelector('.snow-timeline__legend-swatch--am')).toBeInTheDocument();
      expect(container.querySelector('.snow-timeline__legend-swatch--pm')).toBeInTheDocument();
      expect(container.querySelector('.snow-timeline__legend-swatch--overnight')).toBeInTheDocument();
    });

    it('legend has aria-label', () => {
      renderTimeline(recentDays, forecastDays);
      expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    });

    it('legend items have hover tooltips explaining time ranges', () => {
      renderTimeline(recentDays, forecastDays);
      expect(screen.getByTitle('Morning \u2014 12 am to 8 am')).toBeInTheDocument();
      expect(screen.getByTitle('Day \u2014 8 am to 6 pm')).toBeInTheDocument();
      expect(screen.getByTitle('Night \u2014 6 pm to 12 am')).toBeInTheDocument();
    });

    it('switches legend labels and tooltips in ski day mode', () => {
      renderTimeline(recentDays, forecastDays, undefined, 'ski');
      expect(screen.getByText('Overnight')).toBeInTheDocument();
      expect(screen.getByText('Daytime')).toBeInTheDocument();
      expect(screen.getByTitle('Overnight \u2014 6 pm previous day to 8 am')).toBeInTheDocument();
      expect(screen.getByTitle('Daytime \u2014 8 am to 6 pm')).toBeInTheDocument();
    });
  });
});
