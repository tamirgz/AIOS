import { listPeople } from "../queries";
import { PeopleList } from "../components/PeopleList";

export async function PeoplePage() {
  const people = await listPeople();
  return <PeopleList people={people} />;
}
