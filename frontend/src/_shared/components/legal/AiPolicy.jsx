import PolicyPage from './shared/PolicyPage';

/** The Mimi AI usage policy. Its wording and version are managed in Settings > Policies. */
export default function AiPolicy() {
  return <PolicyPage policyKey="mimi_ai_policy" actionContext="ai_assistant" />;
}
