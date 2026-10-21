# SUNFLEX-EMS · tareas habituales del proyecto
PY ?= python3
PORT ?= 8501

.PHONY: help install run check smoke casepack verify docs app clean diag
	@echo "make diag          comprueba si lo que ve el navegador sale de este repo o de una copia rancia"

help:
	@echo "make install       pip install -r requirements.txt"
	@echo "make run           streamlit run app.py (preview, 0.0.0.0:$(PORT))"
	@echo "make smoke         corre el motor completo (5 activos x 5 escenarios)"
	@echo "make casepack      regenera las hojas LF/ED de las dos herramientas"
	@echo "make verify        node tools/verify_casepack.mjs --ed-solve"
	@echo "make docs          reescribe docs/RESPUESTA_SUBSANACION.{md,docx}, README y CHECKLIST"
	@echo "make check         smoke + casepack + verify + test de la app  (lo que corre el CI)"
	@echo "make app           alias de run"

install:
	$(PY) -m pip install -r requirements.txt

run app:
	$(PY) -m streamlit run app.py --server.address 0.0.0.0 --server.port $(PORT) \
	  --server.headless true --server.enableStaticServing true --browser.gatherUsageStats false

smoke:
	$(PY) sunflex_model.py

casepack:
	$(PY) gen_casepack.py

verify:
	node tools/verify_casepack.mjs --ed-solve

diag:
	$(PY) tools/diagnostico.py

docs:
	$(PY) gen_docs.py
	$(PY) gen_habilitantes.py

check: smoke casepack verify
	$(PY) tools/check_app.py
	@echo "TODO OK"

clean:
	rm -rf __pycache__ .pytest_cache
