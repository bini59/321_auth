import { useState, type FormEvent } from 'react';
import { useCreateService } from '@/api/queries';
import { useToast } from '@/components/toast';

const EMPTY_FORM = { client_id: '', name: '', allowed_origins: '', default_redirect: '', auto_provision: false, onboarding_path: '' };

export function ServiceForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const createService = useCreateService();

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await createService.mutateAsync({
        service_id: form.client_id,
        name: form.name,
        allowed_origins: form.allowed_origins.split(',').map((value) => value.trim()),
        default_redirect: form.default_redirect,
        auto_provision: form.auto_provision,
        onboarding_path: form.onboarding_path || null,
      });
      onClose();
      toast(`생성됨. 새 secret: ${result.secret}`);
    } catch {
      toast('생성에 실패했습니다. 입력값을 확인하세요.', 'danger');
    }
  };

  return (
    <form className="card" style={{ marginBottom: 12 }} onSubmit={(event) => void create(event)}>
      <div className="card-head">새 서비스</div>
      <div className="card-body">
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="svc-id">서비스 ID</label>
            <input id="svc-id" className="input mono" required placeholder="notes" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="svc-name">서비스 이름</label>
            <input id="svc-name" className="input" required placeholder="Notes" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="svc-origins">허용 origin (쉼표로 구분)</label>
            <input id="svc-origins" className="input mono" required placeholder="https://notes.bini59.dev" value={form.allowed_origins} onChange={(e) => setForm({ ...form, allowed_origins: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="svc-redirect">기본 반환 주소</label>
            <input id="svc-redirect" className="input mono" required placeholder="/app" value={form.default_redirect} onChange={(e) => setForm({ ...form, default_redirect: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="svc-onboarding">온보딩 path</label>
            <input id="svc-onboarding" className="input mono" placeholder="/onboarding" value={form.onboarding_path} onChange={(e) => setForm({ ...form, onboarding_path: e.target.value })} />
          </div>
        </div>
        <div className="form-foot">
          <label className="checkbox">
            <input type="checkbox" checked={form.auto_provision} onChange={(e) => setForm({ ...form, auto_provision: e.target.checked })} />
            신규 사용자 자동 프로비저닝 허용
          </label>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn--accent">등록</button>
        </div>
      </div>
    </form>
  );
}
