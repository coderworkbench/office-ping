// Message templates, and which ones are quick buttons on the home screen.

export type Template = { id: number; title: string; message: string; show_on_home?: boolean };

export const HOME_TEMPLATES_MAX = 3;

/** The ones HR/admins put on the home screen, or the first three if nobody has chosen yet. */
export function homeTemplates(all: Template[]): Template[] {
  const chosen = all.filter(t => t.show_on_home);
  return (chosen.length ? chosen : all).slice(0, HOME_TEMPLATES_MAX);
}
