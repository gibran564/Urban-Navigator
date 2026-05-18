import type { Route } from '@/lib/types';

const STATIC_RULES = `
better(A, B) :-
  route(A, TimeA, RiskA, ExposureA, ScoreA),
  route(B, TimeB, RiskB, ExposureB, ScoreB),
  CompositeA is TimeA * 1.3 + RiskA * 3.8 + ExposureA * 5 - ScoreA / 14,
  CompositeB is TimeB * 1.3 + RiskB * 3.8 + ExposureB * 5 - ScoreB / 14,
  CompositeA < CompositeB.

recommended(Id) :-
  route(Id, _, _, _, _),
  \\+ (route(Other, _, _, _, _), Other \\= Id, better(Other, Id)).

verdict(Id, recommended) :- recommended(Id), !.
verdict(Id, alternative) :- route(Id, Time, Risk, Exposure, _), Time =< 18, Risk =< 12, Exposure =< 8, !.
verdict(Id, discarded).
`;

export function buildRouteFacts(routes: Route[]): string {
  return routes
    .map((route) => {
      const id = route.id ?? 'route_unknown';
      const time = route.totalMinutes ?? Math.round(route.cost / 60);
      const risk = Math.round((route.riskScore ?? 0) * 10) / 10;
      const exposure = Math.round((route.exposureScore ?? 0) * 10) / 10;
      const score = Math.round(route.efficiencyScore ?? 0);
      return `route(${id}, ${time}, ${risk}, ${exposure}, ${score}).`;
    })
    .join('\n');
}

export function buildInferenceProgram(routes: Route[]): string {
  return `${STATIC_RULES}\n${buildRouteFacts(routes)}`;
}
