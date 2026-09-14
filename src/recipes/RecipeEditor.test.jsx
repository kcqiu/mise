import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeEditor from './components/RecipeEditor';
import { buildGeminiCoverPrompt, generateRecipeCoverWithGemini } from './ai';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('RecipeEditor component', () => {
  const defaultRecipe = {
    id: 'test-1',
    title: 'Matcha Pound Cake',
    description: 'Rich and buttery matcha loaf.',
    category: 'Baking',
    tags: ['Dessert'],
    cuisine: 'Japanese',
    method: 'Baking',
    keywords: ['matcha'],
    prepMinutes: 15,
    cookMinutes: 45,
    restMinutes: 10,
    servings: 8,
    artwork: '',
    sourceVideo: '',
    ingredients: [{ quantity: 2, unit: 'cups', name: 'Flour', group: '', note: '' }],
    steps: [{ title: 'Mix', instruction: 'Whisk matcha with flour.' }],
    notes: [],
    substitutions: [],
    equipment: [],
  };

  it('displays local backup notice when not in cloud mode', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={false}
      />
    );

    expect(
      screen.getByText('Saved on this browser. Export a backup to keep a copy.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Saved to your synced cloud cookbook/i)
    ).not.toBeInTheDocument();
  });

  it('displays cloud sync text when isCloud is true', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    expect(
      screen.getByText(/Saved to your synced cloud cookbook/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Saved on this browser/i)
    ).not.toBeInTheDocument();
  });

  it('shows cookbook deletion text when isCloud is true', async () => {
    const user = userEvent.setup();
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /Delete recipe/i }));
    expect(
      screen.getByText('Delete this recipe from your cookbook?')
    ).toBeInTheDocument();
  });

  it('provides cover photo controls including upload, URL and Gemini AI placeholder', async () => {
    const user = userEvent.setup();
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    expect(screen.getByRole('button', { name: /Upload photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate with Gemini/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/paste an image URL/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Generate with Gemini/i }));
    expect(
      screen.getByText(/Gemini AI: Realistic photo generation will automatically render your dish/i)
    ).toBeInTheDocument();
  });
});

describe('Gemini AI module', () => {
  it('buildGeminiCoverPrompt creates descriptive photography prompt', () => {
    const recipe = {
      title: 'Lobster Risotto',
      description: 'Creamy arborio rice with butter poached lobster.',
      cuisine: 'Italian',
      ingredients: [{ name: 'Arborio rice' }, { name: 'Lobster tails' }, { name: 'Parmigiano' }],
    };
    const prompt = buildGeminiCoverPrompt(recipe);
    expect(prompt).toContain('Lobster Risotto');
    expect(prompt).toContain('Italian style');
    expect(prompt).toContain('Arborio rice, Lobster tails, Parmigiano');
    expect(prompt).toContain('photorealistic');
  });

  it('generateRecipeCoverWithGemini placeholder throws informative error', async () => {
    await expect(generateRecipeCoverWithGemini({})).rejects.toThrow(
      /upcoming AI update/i
    );
  });
});
