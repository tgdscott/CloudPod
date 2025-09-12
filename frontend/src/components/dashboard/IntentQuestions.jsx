import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// props: open, onSubmit({ flubber, intern, sfx }), onCancel, hide={{flubber:bool,intern:bool,sfx:bool}}
export default function IntentQuestions({ open, onSubmit, onCancel, hide }){
  const [answers, setAnswers] = useState({ flubber: 'no', intern: 'no', sfx: 'no' });
  useEffect(()=>{ if(open){ setAnswers({ flubber:'no', intern:'no', sfx:'no' }); } }, [open]);
  if(!open) return null;
  const h = hide || {};
  const allAnswered = ['flubber','intern','sfx']
    .filter(k => !h[k])
    .every(k => ['yes','no','unknown'].includes(answers[k]));
  const Radio = ({name,label}) => (
    <div className="flex items-center gap-4 text-sm">
      <div className="w-64 text-[13px]">{label}</div>
      {['yes','no','unknown'].map(v => (
        <label key={v} className="flex items-center gap-1 cursor-pointer">
          <input type="radio" name={name} value={v}
                 checked={answers[name]===v}
                 onChange={()=> setAnswers(a=>({...a,[name]:v}))} />
          <span className="capitalize">{v==='unknown' ? "I Don't Remember" : v}</span>
        </label>
      ))}
    </div>
  );
  const submit = () => onSubmit({
    flubber: h.flubber ? 'no' : answers.flubber,
    intern: h.intern ? 'no' : answers.intern,
    sfx: h.sfx ? 'no' : answers.sfx,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Before We Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!h.flubber && <Radio name="flubber" label="Is there a Flubber?"/>}
          {!h.intern && <Radio name="intern" label="Is there an Intern?"/>}
          {!h.sfx && <Radio name="sfx" label="Are there any word Sound Effects?"/>}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={submit} disabled={!allAnswered}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
