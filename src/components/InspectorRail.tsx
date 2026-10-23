import { SlidersHorizontal, Sparkles, Sliders, Volume2 } from '../icons';
import type { InspectorTab } from './Inspector';
import './InspectorRail.css';

interface Props {
  tab: InspectorTab;
  open: boolean;
  audioSelection: boolean;
  onSelect: (tab: InspectorTab) => void;
}

export default function InspectorRail({ tab, open, audioSelection, onSelect }: Props) {
  const menus = [
    {
      id: 'design',
      label: 'Design',
      icon: SlidersHorizontal,
      description: 'Position, size and content',
    },
    {
      id: 'motion',
      label: audioSelection ? 'Sound' : 'Motion',
      icon: audioSelection ? Volume2 : Sparkles,
      description: audioSelection ? 'Volume and fades' : 'Animation and timing',
    },
    {
      id: 'color',
      label: 'Color',
      icon: Sliders,
      description: 'Colors, looks and image adjustments',
    },
  ] as const;

  return (
    <nav className="inspector-rail" aria-label="Editing menus">
      {menus.map(({ id, label, icon: Icon, description }) => (
        <button
          key={id}
          id={`inspector-menu-${id}`}
          type="button"
          aria-pressed={open && tab === id}
          aria-expanded={open && tab === id}
          aria-controls={open && tab === id ? 'inspector-panel' : undefined}
          disabled={id === 'color' && audioSelection}
          title={
            id === 'color' && audioSelection
              ? 'Color is available for visual elements'
              : description
          }
          onClick={() => onSelect(id)}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
