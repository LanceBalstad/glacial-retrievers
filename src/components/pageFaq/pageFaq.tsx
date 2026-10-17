import "./pageFaq.css";

export interface PageQuestion {
  question: string;
  answer: string;
}

interface PageFaqProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  questions: PageQuestion[];
}

const PageFaq = ({
  id,
  eyebrow,
  title,
  description,
  questions,
}: PageFaqProps) => (
  <section className="content-faq" id={id}>
    <div className="content-faq-heading">
      <p className="content-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <div className="content-questions">
      {questions.map(({ question, answer }) => (
        <details className="content-question" key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  </section>
);

export default PageFaq;
