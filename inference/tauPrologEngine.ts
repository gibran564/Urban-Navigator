import pl from 'tau-prolog';
import { buildInferenceProgram } from '@/inference/prologRules';
import { sortRoutesForDecision } from '@/engine/simulation';
import type { Route, RouteDecision, SimulationResult } from '@/lib/types';

function consult(session: ReturnType<typeof pl.create>, program: string): Promise<void> {
  return new Promise((resolve, reject) => {
    session.consult(program, { success: resolve, error: reject });
  });
}

function query(session: ReturnType<typeof pl.create>, goal: string): Promise<void> {
  return new Promise((resolve, reject) => {
    session.query(goal, { success: resolve, error: reject });
  });
}

function firstAnswer(session: ReturnType<typeof pl.create>): Promise<string | null> {
  return new Promise((resolve, reject) => {
    session.answer({
      success: (answer) => resolve(session.format_answer(answer)),
      fail: () => resolve(null),
      error: reject,
      limit: () => reject(new Error('Tau Prolog alcanzo el limite de inferencia')),
    });
  });
}

function parseAtom(formattedAnswer: string | null, variableName: string): string | undefined {
  if (!formattedAnswer) return undefined;
  const match = formattedAnswer.match(new RegExp(`${variableName}\\s*=\\s*([a-zA-Z0-9_]+)`));
  return match?.[1];
}

function decisionReason(route: Route, best?: Route): string {
  const time = route.totalMinutes ?? Math.round(route.cost / 60);
  const risk = route.riskScore ?? 0;
  const mainPenalty = route.penalties?.[0];

  if (best && best.id !== route.id) {
    const bestTime = best.totalMinutes ?? Math.round(best.cost / 60);
    return `Descartada porque su estimado es ${time} min frente a ${bestTime} min de la ruta recomendada.`;
  }

  if (mainPenalty) {
    return `Seleccionada porque balancea ${time} min simulados y evita el mayor impacto de ${mainPenalty.label.toLowerCase()}.`;
  }

  return `Seleccionada por menor tiempo simulado (${time} min), riesgo ${risk.toFixed(1)} y alta eficiencia.`;
}

export async function inferRouteDecision(routes: Route[]): Promise<SimulationResult> {
  if (!routes.length) return { routes: [] };

  const sorted = sortRoutesForDecision(routes);
  const program = buildInferenceProgram(sorted);
  const session = pl.create(500);

  await consult(session, program);
  await query(session, 'recommended(Best).');
  const recommendedRouteId = parseAtom(await firstAnswer(session), 'Best') ?? sorted[0].id;
  const best = sorted.find((route) => route.id === recommendedRouteId) ?? sorted[0];

  const annotatedRoutes = sorted.map((route, index) => {
    const verdict: RouteDecision['verdict'] = route.id === best.id ? 'recommended' : index < 3 ? 'alternative' : 'discarded';
    const decision: RouteDecision = {
      rank: index + 1,
      verdict,
      reason: decisionReason(route, best),
      prologFacts: [
        `route(${route.id}, ${route.totalMinutes}, ${route.riskScore}, ${route.exposureScore}, ${route.efficiencyScore}).`,
        verdict === 'recommended' ? `recommended(${route.id}).` : `verdict(${route.id}, ${verdict}).`,
      ],
    };

    return { ...route, label: index === 0 ? 'Ruta recomendada' : `Alternativa ${index}`, decision };
  });

  return {
    routes: annotatedRoutes,
    recommendedRouteId: best.id,
    explanation: annotatedRoutes[0]?.decision?.reason,
  };
}
