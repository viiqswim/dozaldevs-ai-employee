import { render, screen } from '@testing-library/react';
import { WizardEditStep, type EditedFields } from '../panels/employees/components/WizardEditStep';

const editedFields: EditedFields = {
  identity: 'A friendly assistant.',
  execution_steps: '1. Greet the user.',
  delivery_steps: '1. Post to Slack.',
  role_name: 'test-employee',
  approval_required: true,
  trigger_type: 'manual',
  temperature: 1,
};

function renderWizardStep() {
  return render(
    <WizardEditStep
      editedFields={editedFields}
      setEditedFields={() => {}}
      inputSchemaItems={[]}
      setInputSchemaItems={() => {}}
      config={null}
      repos={[]}
      reposLoading={false}
      reposError={null}
      githubConnected={false}
      repoUrl=""
      setRepoUrl={() => {}}
      slackChannels={[]}
      slackLoading={false}
      slackError={undefined}
      notificationChannel=""
      setNotificationChannel={() => {}}
      onPreview={() => {}}
      onBack={() => {}}
    />,
  );
}

test('WizardEditStep renders the core editable fields', () => {
  renderWizardStep();
  expect(screen.getByText('Employee Name')).toBeInTheDocument();
  expect(screen.getByText('Identity')).toBeInTheDocument();
  expect(screen.getByText('Execution Steps')).toBeInTheDocument();
  expect(screen.getByDisplayValue('test-employee')).toBeInTheDocument();
});

test('WizardEditStep renders the navigation buttons', () => {
  renderWizardStep();
  expect(screen.getByRole('button', { name: /back to describe/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /preview agents\.md/i })).toBeInTheDocument();
});
