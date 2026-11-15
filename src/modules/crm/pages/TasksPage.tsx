import { ListTodo } from "lucide-react";
import { EmptyState } from "../components/shared/EmptyState";

export default function TasksPage() {
  return <EmptyState icon={ListTodo} title="Tarefas" description="Em construção: retornos agendados, atrasados em destaque e a visão do seu dia." />;
}
